"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inicioSegunRol, obtenerPerfil } from "@/lib/auth";

export type EstadoLogin = { error: string | null };

export async function iniciarSesion(
  _prev: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Mensaje genérico: no revelamos si el correo existe o no.
    return { error: "Correo o contraseña incorrectos." };
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
