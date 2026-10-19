"use server";

/**
 * Acciones de administración del personal.
 *
 * Cada acción vuelve a verificar que quien llama es admin (una Server Action
 * es un endpoint público: no basta con que el botón esté en una página
 * protegida). Usan la clave secreta para la API de Auth de Supabase.
 *
 * No existe "eliminar persona": las marcas deben conservarse (la DT exige
 * mantener los registros hasta 5 años). En su lugar se DESACTIVA, lo que
 * además bloquea el inicio de sesión.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { adminParaAccion } from "@/lib/auth";
import { esRutValido, formatearRut } from "@/lib/rut";
import { DIAS, validarDia, type DiaHorario } from "@/lib/horarios";

export type EstadoAccion = { ok: boolean; mensaje: string } | null;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** "Baneo" de ~100 años en Supabase Auth = no puede iniciar sesión. */
const BLOQUEO_INDEFINIDO = "876000h";

const NO_AUTORIZADO: EstadoAccion = { ok: false, mensaje: "No tienes permisos para esto." };

function texto(fd: FormData, campo: string, max = 120): string {
  return String(fd.get(campo) ?? "").trim().slice(0, max);
}

/** Valida y normaliza los campos comunes del perfil. */
function leerPerfil(fd: FormData):
  | { error: string }
  | { nombre: string; rut: string | null; cargo: string | null; rol: "admin" | "empleado" } {
  const nombre = texto(fd, "nombre");
  const rutCrudo = texto(fd, "rut", 20);
  const cargo = texto(fd, "cargo", 60) || null;
  const rol = fd.get("rol") === "admin" ? "admin" : "empleado";

  if (nombre.length < 3) return { error: "Escribe el nombre completo." };
  if (rutCrudo && !esRutValido(rutCrudo)) return { error: "El RUT no es válido." };

  return { nombre, rut: rutCrudo ? formatearRut(rutCrudo) : null, cargo, rol };
}

function errorUnico(mensaje: string | undefined): string {
  return mensaje?.includes("rut") ? "Ese RUT ya está registrado." : "No se pudo guardar.";
}

// ---------------------------------------------------------------------------
// Crear persona
// ---------------------------------------------------------------------------

export async function crearPersona(_prev: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  if (!(await adminParaAccion())) return NO_AUTORIZADO;

  const perfil = leerPerfil(fd);
  if ("error" in perfil) return { ok: false, mensaje: perfil.error };

  const email = texto(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");

  if (!RE_EMAIL.test(email)) return { ok: false, mensaje: "El correo no es válido." };
  if (password.length < 8) {
    return { ok: false, mensaje: "La contraseña debe tener al menos 8 caracteres." };
  }

  const admin = createAdminClient();

  // 0. RUT duplicado: se revisa ANTES de crear la cuenta para no dejarla a medias.
  if (perfil.rut) {
    const { data: existe } = await admin
      .from("usuarios")
      .select("id")
      .eq("rut", perfil.rut)
      .maybeSingle();
    if (existe) return { ok: false, mensaje: "Ese RUT ya está registrado." };
  }

  // 1. Crear la cuenta en Auth (ya confirmada: no se envía correo).
  //    El trigger on_auth_user_created crea la fila en public.usuarios.
  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: perfil.nombre },
  });

  if (errorAuth || !creado.user) {
    const yaExiste =
      errorAuth?.code === "email_exists" || errorAuth?.message?.toLowerCase().includes("already");
    return {
      ok: false,
      mensaje: yaExiste ? "Ya existe una cuenta con ese correo." : "No se pudo crear la cuenta.",
    };
  }

  // 2. Completar el perfil (RUT, cargo, rol).
  const { error } = await admin
    .from("usuarios")
    .update({ nombre: perfil.nombre, rut: perfil.rut, cargo: perfil.cargo, rol: perfil.rol })
    .eq("id", creado.user.id);

  if (error) {
    console.error("[personal] perfil", error);
    // La cuenta quedó creada: llevamos a su ficha para que se corrija ahí.
    revalidatePath("/admin/personal");
    redirect(`/admin/personal/${creado.user.id}?aviso=perfil`);
  }

  revalidatePath("/admin/personal");
  // Siguiente paso natural: asignarle el horario.
  redirect(`/admin/personal/${creado.user.id}?nuevo=1`);
}

// ---------------------------------------------------------------------------
// Editar perfil
// ---------------------------------------------------------------------------

export async function actualizarPersona(_prev: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const yo = await adminParaAccion();
  if (!yo) return NO_AUTORIZADO;

  const id = texto(fd, "id", 40);
  if (!RE_UUID.test(id)) return { ok: false, mensaje: "Persona no válida." };

  const perfil = leerPerfil(fd);
  if ("error" in perfil) return { ok: false, mensaje: perfil.error };

  // Evita que el admin se quite el acceso a sí mismo por error.
  if (id === yo.id && perfil.rol !== "admin") {
    return { ok: false, mensaje: "No puedes quitarte tu propio rol de administrador." };
  }

  const { error } = await createAdminClient().from("usuarios").update(perfil).eq("id", id);

  if (error) {
    console.error("[personal] actualizar", error);
    return { ok: false, mensaje: error.code === "23505" ? errorUnico(error.message) : "No se pudo guardar." };
  }

  revalidatePath("/admin/personal");
  revalidatePath(`/admin/personal/${id}`);
  return { ok: true, mensaje: "Datos guardados." };
}

// ---------------------------------------------------------------------------
// Activar / desactivar
// ---------------------------------------------------------------------------

export async function cambiarActivo(_prev: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const yo = await adminParaAccion();
  if (!yo) return NO_AUTORIZADO;

  const id = texto(fd, "id", 40);
  const activar = fd.get("activar") === "1";
  if (!RE_UUID.test(id)) return { ok: false, mensaje: "Persona no válida." };
  if (id === yo.id && !activar) {
    return { ok: false, mensaje: "No puedes desactivar tu propia cuenta." };
  }

  const admin = createAdminClient();

  // 1. Bloquear/desbloquear el inicio de sesión en Auth.
  const { error: errorAuth } = await admin.auth.admin.updateUserById(id, {
    ban_duration: activar ? "none" : BLOQUEO_INDEFINIDO,
  });
  if (errorAuth) {
    console.error("[personal] ban", errorAuth);
    return { ok: false, mensaje: "No se pudo cambiar el acceso." };
  }

  // 2. Marcar el perfil (el panel y los reportes lo usan).
  const { error } = await admin.from("usuarios").update({ activo: activar }).eq("id", id);
  if (error) {
    console.error("[personal] activo", error);
    return { ok: false, mensaje: "No se pudo actualizar el perfil." };
  }

  revalidatePath("/admin/personal");
  revalidatePath(`/admin/personal/${id}`);
  return {
    ok: true,
    mensaje: activar
      ? "Cuenta reactivada: ya puede iniciar sesión."
      : "Cuenta desactivada: ya no puede iniciar sesión. Sus registros se conservan.",
  };
}

// ---------------------------------------------------------------------------
// Cambiar contraseña
// ---------------------------------------------------------------------------

export async function cambiarContrasena(_prev: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  if (!(await adminParaAccion())) return NO_AUTORIZADO;

  const id = texto(fd, "id", 40);
  const password = String(fd.get("password") ?? "");
  if (!RE_UUID.test(id)) return { ok: false, mensaje: "Persona no válida." };
  if (password.length < 8) {
    return { ok: false, mensaje: "La contraseña debe tener al menos 8 caracteres." };
  }

  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password });
  if (error) {
    console.error("[personal] contraseña", error);
    return { ok: false, mensaje: "No se pudo cambiar la contraseña." };
  }

  return { ok: true, mensaje: "Contraseña actualizada. Entrégasela a la persona en privado." };
}

// ---------------------------------------------------------------------------
// Guardar horario semanal
// ---------------------------------------------------------------------------

export async function guardarHorario(_prev: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  if (!(await adminParaAccion())) return NO_AUTORIZADO;

  const id = texto(fd, "id", 40);
  if (!RE_UUID.test(id)) return { ok: false, mensaje: "Persona no válida." };

  // Leer los 7 días del formulario: trabaja_N, entrada_N, salida_N, colacion_N, tolerancia_N
  const dias: DiaHorario[] = [];
  for (const { n } of DIAS) {
    if (fd.get(`trabaja_${n}`) !== "on") continue;
    const dia: DiaHorario = {
      dia_semana: n,
      hora_entrada: texto(fd, `entrada_${n}`, 5),
      hora_salida: texto(fd, `salida_${n}`, 5),
      minutos_colacion: Number(fd.get(`colacion_${n}`) ?? 0),
      tolerancia_minutos: Number(fd.get(`tolerancia_${n}`) ?? 0),
    };
    const error = validarDia(dia);
    if (error) return { ok: false, mensaje: error };
    dias.push(dia);
  }

  const admin = createAdminClient();

  // 1. Insertar/actualizar los días que trabaja.
  if (dias.length) {
    const { error } = await admin
      .from("horarios")
      .upsert(
        dias.map((d) => ({ usuario_id: id, ...d })),
        { onConflict: "usuario_id,dia_semana" },
      );
    if (error) {
      console.error("[personal] horario upsert", error);
      return { ok: false, mensaje: "No se pudo guardar el horario." };
    }
  }

  // 2. Borrar los días que ya no trabaja.
  const diasLibres = DIAS.map((d) => d.n).filter((n) => !dias.some((d) => d.dia_semana === n));
  if (diasLibres.length) {
    const { error } = await admin
      .from("horarios")
      .delete()
      .eq("usuario_id", id)
      .in("dia_semana", diasLibres);
    if (error) {
      console.error("[personal] horario delete", error);
      return { ok: false, mensaje: "No se pudieron quitar los días libres." };
    }
  }

  revalidatePath("/admin/personal");
  revalidatePath(`/admin/personal/${id}`);
  return {
    ok: true,
    mensaje: dias.length ? "Horario guardado." : "Horario borrado: la persona no tiene días asignados.",
  };
}
