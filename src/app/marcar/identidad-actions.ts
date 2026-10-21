"use server";

/**
 * Acciones del celular de la persona para la huella / Face ID.
 * La identidad sale SIEMPRE de la sesión (cookies), nunca del navegador.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { completarRegistro, opcionesRegistro, opcionesVerificacion } from "@/lib/identidad";

async function usuarioActual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createAdminClient()
    .from("usuarios")
    .select("id, usuario, nombre, activo")
    .eq("id", user.id)
    .single();
  return data?.activo ? data : null;
}

/** Paso 1 de la activación: valida el código y entrega las opciones. */
export async function prepararActivacion(
  codigo: string,
): Promise<{ ok: true; opciones: PublicKeyCredentialCreationOptionsJSON } | { ok: false; mensaje: string }> {
  const u = await usuarioActual();
  if (!u) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const r = await opcionesRegistro(u, String(codigo ?? "").replace(/\D/g, "").slice(0, 6));
  return r.ok ? { ok: true, opciones: r.datos } : r;
}

/** Paso 2: guarda la llave del celular. */
export async function completarActivacion(
  codigo: string,
  respuesta: RegistrationResponseJSON,
): Promise<{ ok: boolean; mensaje: string }> {
  const u = await usuarioActual();
  if (!u) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const ua = (await headers()).get("user-agent");
  const r = await completarRegistro(u.id, String(codigo ?? "").replace(/\D/g, "").slice(0, 6), respuesta, ua);
  if (!r.ok) return r;

  revalidatePath("/marcar");
  return { ok: true, mensaje: "¡Listo! Tu huella quedó activada en este celular." };
}

/** Opciones para pedir la huella al marcar (null si no tiene huella activa). */
export async function prepararVerificacion(): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  const u = await usuarioActual();
  if (!u) return null;
  return opcionesVerificacion(u.id);
}
