/**
 * Helpers de sesión y rol para Server Components, Server Actions y Route Handlers.
 */
import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Perfil = {
  id: string;
  nombre: string;
  email: string;
  rol: "admin" | "empleado";
  activo: boolean;
};

/** Devuelve el perfil del usuario logueado o null. */
export async function obtenerPerfil(): Promise<Perfil | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("id, nombre, email, rol, activo")
    .eq("id", user.id)
    .single();

  return (data as Perfil | null) ?? null;
}

/** Para páginas: si no es admin activo, lo saca de ahí. */
export async function requerirAdmin(): Promise<Perfil> {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect("/login");
  if (perfil.rol !== "admin" || !perfil.activo) redirect("/marcar");
  return perfil;
}

/**
 * Para Server Actions: devuelve el perfil si es admin activo, o null.
 * (Las acciones no deben redirigir a mitad de un formulario: devuelven error.)
 */
export async function adminParaAccion(): Promise<Perfil | null> {
  const perfil = await obtenerPerfil();
  return perfil && perfil.rol === "admin" && perfil.activo ? perfil : null;
}

/** Destino inicial según rol. */
export function inicioSegunRol(perfil: Pick<Perfil, "rol">): string {
  return perfil.rol === "admin" ? "/admin/asistencia" : "/marcar";
}
