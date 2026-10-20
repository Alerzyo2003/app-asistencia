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
import {
  DIAS,
  MAX_SEMANAS_CICLO,
  esFecha,
  letraSemana,
  lunesDe,
  validarDia,
  type DiaHorario,
} from "@/lib/horarios";
import { PREFIJO_CORREO_INTERNO, esUsuarioValido, normalizarUsuario } from "@/lib/usuario";

export type EstadoAccion = { ok: boolean; mensaje: string } | null;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** "Baneo" de ~100 años en Supabase Auth = no puede iniciar sesión. */
const BLOQUEO_INDEFINIDO = "876000h";

const NO_AUTORIZADO: EstadoAccion = { ok: false, mensaje: "No tienes permisos para esto." };

/** Dominio de los correos internos (para quien no tiene correo). */
const DOMINIO_INTERNO = process.env.AUTH_DOMINIO_INTERNO || "clinicadignidad.com";
const MSJ_USUARIO =
  "El usuario debe tener entre 3 y 30 caracteres: minúsculas, números, punto, guion o guion bajo (sin espacios ni tildes).";

function texto(fd: FormData, campo: string, max = 120): string {
  return String(fd.get(campo) ?? "").trim().slice(0, max);
}

/** Valida y normaliza los campos comunes del perfil. */
function leerPerfil(fd: FormData):
  | { error: string }
  | {
      nombre: string;
      usuario: string;
      rut: string | null;
      cargo: string | null;
      rol: "admin" | "empleado";
    } {
  const nombre = texto(fd, "nombre");
  const usuario = normalizarUsuario(texto(fd, "usuario", 40));
  const rutCrudo = texto(fd, "rut", 20);
  const cargo = texto(fd, "cargo", 60) || null;
  const rol = fd.get("rol") === "admin" ? "admin" : "empleado";

  if (nombre.length < 3) return { error: "Escribe el nombre completo." };
  if (!esUsuarioValido(usuario)) return { error: MSJ_USUARIO };
  if (rutCrudo && !esRutValido(rutCrudo)) return { error: "El RUT no es válido." };

  return { nombre, usuario, rut: rutCrudo ? formatearRut(rutCrudo) : null, cargo, rol };
}

function errorUnico(mensaje: string | undefined): string {
  if (mensaje?.includes("usuario")) return "Ese usuario ya está en uso. Elige otro.";
  return mensaje?.includes("rut") ? "Ese RUT ya está registrado." : "No se pudo guardar.";
}

// ---------------------------------------------------------------------------
// Crear persona
// ---------------------------------------------------------------------------

export async function crearPersona(_prev: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  if (!(await adminParaAccion())) return NO_AUTORIZADO;

  const perfil = leerPerfil(fd);
  if ("error" in perfil) return { ok: false, mensaje: perfil.error };

  const correo = texto(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");

  // El correo es opcional. Sin correo se usa uno interno que nunca recibe nada.
  if (correo && !RE_EMAIL.test(correo)) return { ok: false, mensaje: "El correo no es válido." };
  const email = correo || `${PREFIJO_CORREO_INTERNO}${perfil.usuario}@${DOMINIO_INTERNO}`;
  if (password.length < 8) {
    return { ok: false, mensaje: "La contraseña debe tener al menos 8 caracteres." };
  }

  const admin = createAdminClient();

  // 0. Usuario y RUT duplicados: se revisan ANTES de crear la cuenta
  //    para no dejarla a medias.
  const { data: usuarioTomado } = await admin
    .from("usuarios")
    .select("id")
    .eq("usuario", perfil.usuario)
    .maybeSingle();
  if (usuarioTomado) return { ok: false, mensaje: "Ese usuario ya está en uso. Elige otro." };

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
    user_metadata: { nombre: perfil.nombre, usuario: perfil.usuario },
  });

  if (errorAuth || !creado.user) {
    const yaExiste =
      errorAuth?.code === "email_exists" || errorAuth?.message?.toLowerCase().includes("already");
    return {
      ok: false,
      mensaje: yaExiste
        ? correo
          ? "Ya existe una cuenta con ese correo."
          : "Ese usuario ya está en uso. Elige otro."
        : "No se pudo crear la cuenta.",
    };
  }

  // 2. Completar el perfil (RUT, cargo, rol).
  const { error } = await admin
    .from("usuarios")
    .update({
      nombre: perfil.nombre,
      usuario: perfil.usuario,
      rut: perfil.rut,
      cargo: perfil.cargo,
      rol: perfil.rol,
    })
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

  // Ciclo: 1 = siempre igual; 2–4 = semanas A/B/C/D intercaladas
  const ciclo = Number(fd.get("ciclo_semanas") ?? 1);
  if (!Number.isInteger(ciclo) || ciclo < 1 || ciclo > MAX_SEMANAS_CICLO) {
    return { ok: false, mensaje: "Ciclo no válido." };
  }
  const inicioCrudo = texto(fd, "ciclo_inicio", 10);
  if (ciclo > 1 && !esFecha(inicioCrudo)) {
    return { ok: false, mensaje: "Indica el lunes en que comienza la Semana A." };
  }
  // Se guarda siempre el lunes de esa semana
  const inicio = ciclo > 1 ? lunesDe(inicioCrudo) : null;

  // Leer cada semana: trabaja_S_N, entrada_S_N, salida_S_N, tolerancia_S_N
  const filas: (DiaHorario & { semana_ciclo: number })[] = [];
  for (let s = 1; s <= ciclo; s++) {
    for (const { n } of DIAS) {
      if (fd.get(`trabaja_${s}_${n}`) !== "on") continue;
      const dia: DiaHorario = {
        dia_semana: n,
        hora_entrada: texto(fd, `entrada_${s}_${n}`, 5),
        hora_salida: texto(fd, `salida_${s}_${n}`, 5),
        tolerancia_minutos: Number(fd.get(`tolerancia_${s}_${n}`) ?? 0),
      };
      const error = validarDia(dia);
      if (error) return { ok: false, mensaje: ciclo > 1 ? `Semana ${letraSemana(s)} · ${error}` : error };
      filas.push({ ...dia, semana_ciclo: s });
    }
  }

  const admin = createAdminClient();

  // 1. Guardar el ciclo de la persona
  const { error: errorCiclo } = await admin
    .from("usuarios")
    .update({ ciclo_semanas: ciclo, ciclo_inicio: inicio })
    .eq("id", id);
  if (errorCiclo) {
    console.error("[personal] ciclo", errorCiclo);
    return { ok: false, mensaje: "No se pudo guardar el ciclo de turnos." };
  }

  // 2. Reemplazar el horario base completo (son pocas filas: borrar e insertar)
  const { error: errorBorrar } = await admin.from("horarios").delete().eq("usuario_id", id);
  if (errorBorrar) {
    console.error("[personal] horario delete", errorBorrar);
    return { ok: false, mensaje: "No se pudo actualizar el horario." };
  }

  if (filas.length) {
    const { error } = await admin.from("horarios").insert(filas.map((f) => ({ usuario_id: id, ...f })));
    if (error) {
      console.error("[personal] horario insert", error);
      return { ok: false, mensaje: "No se pudo guardar el horario. Vuelve a intentarlo." };
    }
  }

  revalidatePath("/admin/personal");
  revalidatePath(`/admin/personal/${id}`);
  revalidatePath("/admin/turnos");

  if (!filas.length) {
    return { ok: true, mensaje: "Horario borrado: la persona no tiene días asignados." };
  }
  return {
    ok: true,
    mensaje:
      ciclo > 1
        ? `Horario guardado: ${ciclo} semanas que se alternan desde el lunes ${inicio!.split("-").reverse().join("-")}.`
        : "Horario guardado.",
  };
}
