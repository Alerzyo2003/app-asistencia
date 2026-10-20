"use server";

/**
 * Inicio de sesión con NOMBRE DE USUARIO.
 *
 * Supabase Auth entra con correo + contraseña, así que el servidor busca el
 * correo que corresponde al usuario (con la clave secreta, la tabla está
 * protegida por RLS) y luego inicia sesión con él. El correo nunca llega al
 * navegador.
 *
 * Si alguien escribe un correo (contiene "@"), también se acepta.
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inicioSegunRol, obtenerPerfil } from "@/lib/auth";
import { esUsuarioValido, normalizarUsuario } from "@/lib/usuario";

export type EstadoLogin = { error: string | null };

const ERROR_GENERICO = "Usuario o contraseña incorrectos.";

export async function iniciarSesion(
  _prev: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const entrada = normalizarUsuario(String(formData.get("usuario") ?? "")).slice(0, 120);
  const password = String(formData.get("password") ?? "");

  if (!entrada || !password) {
    return { error: "Ingresa tu usuario y contraseña." };
  }

  // 1. Resolver el correo
  let email: string | null = null;

  if (entrada.includes("@")) {
    email = entrada;
  } else if (esUsuarioValido(entrada)) {
    const { data, error } = await createAdminClient()
      .from("usuarios")
      .select("email")
      .eq("usuario", entrada)
      .maybeSingle();
    if (error) {
      console.error("[login] búsqueda de usuario", error);
      return { error: "No se pudo iniciar sesión. Intenta otra vez." };
    }
    email = data?.email ?? null;
  }

  // Mensaje genérico: no revelamos si el usuario existe o no.
  if (!email) return { error: ERROR_GENERICO };

  // 2. Iniciar sesión
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Una cuenta desactivada está "baneada" en Auth
    if (error.code === "user_banned") {
      return { error: "Tu usuario no está habilitado. Habla con administración." };
    }
    return { error: ERROR_GENERICO };
  }

  const perfil = await obtenerPerfil();
  if (!perfil || !perfil.activo) {
    await supabase.auth.signOut();
    return { error: "Tu usuario no está habilitado. Habla con administración." };
  }

  redirect(inicioSegunRol(perfil));
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
