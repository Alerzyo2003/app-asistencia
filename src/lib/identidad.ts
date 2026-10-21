/**
 * Verificación de identidad con huella / Face ID (WebAuthn · passkeys).
 *
 * - La biometría la valida el propio celular; al servidor solo llega una
 *   firma digital. Aquí guardamos la llave PÚBLICA de cada persona.
 * - Registrar el celular exige un código de activación que genera la
 *   administración (así nadie registra su teléfono en la cuenta de otro).
 * - Cada desafío es de un solo uso y caduca en minutos (anti-repetición).
 *
 * Solo servidor: usa la clave secreta de Supabase.
 */
import "server-only";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { createAdminClient } from "@/lib/supabase/admin";

const NOMBRE_APP = "Asistencia · Clínica Dignidad";
const VIGENCIA_CODIGO_MIN = 15;
const VIGENCIA_DESAFIO_MIN = 5;
const MAX_INTENTOS_CODIGO = 5;

/** "exigir" (por defecto) o "desactivado" (variable IDENTIDAD_MODO). */
export function modoIdentidad(): "exigir" | "desactivado" {
  return process.env.IDENTIDAD_MODO === "desactivado" ? "desactivado" : "exigir";
}

// ---------------------------------------------------------------------------
// Dominio (rpID) y origen
// ---------------------------------------------------------------------------

/**
 * Las llaves quedan atadas al dominio. Por defecto se toma del request
 * (funciona en localhost y en el dominio de Vercel); se puede fijar con
 * WEBAUTHN_RP_ID y WEBAUTHN_ORIGIN.
 * Ojo: si cambias de dominio (p. ej. de *.vercel.app a uno propio), cada
 * persona debe volver a activar su huella.
 */
async function contexto(): Promise<{ rpID: string; origin: string }> {
  if (process.env.WEBAUTHN_RP_ID && process.env.WEBAUTHN_ORIGIN) {
    return { rpID: process.env.WEBAUTHN_RP_ID, origin: process.env.WEBAUTHN_ORIGIN };
  }
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0].trim();
  const rpID = host.replace(/:\d+$/, "");
  const esLocal = rpID === "localhost" || rpID === "127.0.0.1";
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() ?? (esLocal ? "http" : "https");
  return { rpID, origin: `${proto}://${host}` };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const sha256 = (texto: string) => createHash("sha256").update(texto).digest("hex");

function igualesSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const minutosDesdeAhora = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

/** Descripción simple del equipo a partir del user-agent. */
export function describirDispositivo(ua: string | null): string {
  if (!ua) return "Dispositivo";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) {
    const modelo = ua.match(/Android [\d.]+; ([^;)]+)/)?.[1]?.trim();
    return modelo && !/^K$/i.test(modelo) ? `Android (${modelo})` : "Android";
  }
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh/i.test(ua)) return "Mac";
  return "Dispositivo";
}

async function guardarDesafio(usuarioId: string, tipo: "registro" | "verificacion", desafio: string) {
  const admin = createAdminClient();
  // Limpieza: desafíos viejos o usados de esta persona
  await admin
    .from("desafios_identidad")
    .delete()
    .eq("usuario_id", usuarioId)
    .or(`usado.eq.true,expira_en.lt.${new Date().toISOString()}`);

  const { error } = await admin.from("desafios_identidad").insert({
    usuario_id: usuarioId,
    tipo,
    desafio,
    expira_en: minutosDesdeAhora(VIGENCIA_DESAFIO_MIN),
  });
  if (error) throw new Error(`No se pudo guardar el desafío: ${error.message}`);
}

/** Desafíos vigentes y sin usar de una persona. */
async function desafiosVigentes(usuarioId: string, tipo: "registro" | "verificacion"): Promise<Set<string>> {
  const { data } = await createAdminClient()
    .from("desafios_identidad")
    .select("desafio")
    .eq("usuario_id", usuarioId)
    .eq("tipo", tipo)
    .eq("usado", false)
    .gt("expira_en", new Date().toISOString());
  return new Set((data ?? []).map((d) => d.desafio));
}

async function marcarDesafioUsado(usuarioId: string, desafio: string) {
  await createAdminClient()
    .from("desafios_identidad")
    .update({ usado: true })
    .eq("usuario_id", usuarioId)
    .eq("desafio", desafio);
}

// ---------------------------------------------------------------------------
// Estado (para el panel y la pantalla de marcaje)
// ---------------------------------------------------------------------------

export type EstadoHuella = {
  activa: boolean;
  dispositivo: string | null;
  creadaEn: string | null;
  ultimoUso: string | null;
  codigoPendienteHasta: string | null;
};

export async function estadoHuella(usuarioId: string): Promise<EstadoHuella> {
  const admin = createAdminClient();
  const [{ data: cred }, { data: codigo }] = await Promise.all([
    admin
      .from("credenciales_identidad")
      .select("dispositivo, creada_en, ultimo_uso")
      .eq("usuario_id", usuarioId)
      .order("creada_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("codigos_activacion")
      .select("expira_en")
      .eq("usuario_id", usuarioId)
      .gt("expira_en", new Date().toISOString())
      .maybeSingle(),
  ]);
  return {
    activa: Boolean(cred),
    dispositivo: cred?.dispositivo ?? null,
    creadaEn: cred?.creada_en ?? null,
    ultimoUso: cred?.ultimo_uso ?? null,
    codigoPendienteHasta: codigo?.expira_en ?? null,
  };
}

// ---------------------------------------------------------------------------
// Administración: código de activación y reinicio
// ---------------------------------------------------------------------------

/** Genera un código de 6 dígitos (vigencia 15 min). Devuelve el código en claro. */
export async function generarCodigoActivacion(usuarioId: string): Promise<{ codigo: string; expiraEn: string }> {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiraEn = minutosDesdeAhora(VIGENCIA_CODIGO_MIN);
  const { error } = await createAdminClient()
    .from("codigos_activacion")
    .upsert(
      { usuario_id: usuarioId, codigo_hash: sha256(codigo), expira_en: expiraEn, intentos: 0, creado_en: new Date().toISOString() },
      { onConflict: "usuario_id" },
    );
  if (error) throw new Error(error.message);
  return { codigo, expiraEn };
}

/** Borra la huella registrada (cambio de celular, pérdida, etc.). */
export async function quitarHuella(usuarioId: string) {
  const { error } = await createAdminClient().from("credenciales_identidad").delete().eq("usuario_id", usuarioId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Registro de la huella (lo hace la persona en su celular)
// ---------------------------------------------------------------------------

type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

/** Valida el código (sin consumirlo) y sumando un intento si es incorrecto. */
async function validarCodigo(usuarioId: string, codigo: string): Promise<Resultado<null>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("codigos_activacion")
    .select("codigo_hash, expira_en, intentos")
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (!data || new Date(data.expira_en) < new Date()) {
    return { ok: false, mensaje: "No tienes un código vigente. Pide uno nuevo a administración." };
  }
  if (data.intentos >= MAX_INTENTOS_CODIGO) {
    return { ok: false, mensaje: "Demasiados intentos. Pide un código nuevo a administración." };
  }
  if (!/^\d{6}$/.test(codigo) || !igualesSeguro(sha256(codigo), data.codigo_hash)) {
    await admin.from("codigos_activacion").update({ intentos: data.intentos + 1 }).eq("usuario_id", usuarioId);
    return { ok: false, mensaje: "Código incorrecto." };
  }
  return { ok: true, datos: null };
}

export async function opcionesRegistro(
  usuario: { id: string; usuario: string; nombre: string },
  codigo: string,
): Promise<Resultado<PublicKeyCredentialCreationOptionsJSON>> {
  const valido = await validarCodigo(usuario.id, codigo);
  if (!valido.ok) return valido;

  const { rpID } = await contexto();
  const opciones = await generateRegistrationOptions({
    rpName: NOMBRE_APP,
    rpID,
    userName: usuario.usuario,
    userDisplayName: usuario.nombre,
    userID: new TextEncoder().encode(usuario.id),
    attestationType: "none",
    timeout: VIGENCIA_DESAFIO_MIN * 60_000,
    authenticatorSelection: {
      authenticatorAttachment: "platform", // el lector del propio celular
      residentKey: "preferred",
      userVerification: "required", // exige huella/rostro/PIN del teléfono
    },
    preferredAuthenticatorType: "localDevice",
  });

  await guardarDesafio(usuario.id, "registro", opciones.challenge);
  return { ok: true, datos: opciones };
}

export async function completarRegistro(
  usuarioId: string,
  codigo: string,
  respuesta: RegistrationResponseJSON,
  userAgent: string | null,
): Promise<Resultado<null>> {
  // El código se vuelve a exigir: sin código vigente no se guarda nada.
  const valido = await validarCodigo(usuarioId, codigo);
  if (!valido.ok) return valido;

  const { rpID, origin } = await contexto();
  const vigentes = await desafiosVigentes(usuarioId, "registro");
  let usado = "";

  let verificacion;
  try {
    verificacion = await verifyRegistrationResponse({
      response: respuesta,
      expectedChallenge: (c) => {
        usado = c;
        return vigentes.has(c);
      },
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (e) {
    console.error("[identidad] registro", e);
    return { ok: false, mensaje: "No se pudo verificar la huella. Intenta otra vez." };
  }
  if (usado) await marcarDesafioUsado(usuarioId, usado);

  if (!verificacion.verified) {
    return { ok: false, mensaje: "No se pudo verificar la huella. Intenta otra vez." };
  }

  const { credential } = verificacion.registrationInfo;
  const admin = createAdminClient();

  // Una sola llave por persona: la nueva reemplaza a la anterior.
  await admin.from("credenciales_identidad").delete().eq("usuario_id", usuarioId);
  const { error } = await admin.from("credenciales_identidad").insert({
    usuario_id: usuarioId,
    credencial_id: credential.id,
    llave_publica: isoBase64URL.fromBuffer(credential.publicKey),
    contador: credential.counter,
    transportes: credential.transports ?? null,
    dispositivo: describirDispositivo(userAgent),
  });
  if (error) {
    console.error("[identidad] guardar llave", error);
    return { ok: false, mensaje: "No se pudo guardar la huella." };
  }

  // El código es de un solo uso
  await admin.from("codigos_activacion").delete().eq("usuario_id", usuarioId);
  return { ok: true, datos: null };
}

// ---------------------------------------------------------------------------
// Verificación al marcar
// ---------------------------------------------------------------------------

/** Opciones para pedir la huella. null si la persona no tiene huella activa. */
export async function opcionesVerificacion(usuarioId: string): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  const { data: creds } = await createAdminClient()
    .from("credenciales_identidad")
    .select("credencial_id, transportes")
    .eq("usuario_id", usuarioId);
  if (!creds?.length) return null;

  const { rpID } = await contexto();
  const opciones = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    timeout: VIGENCIA_DESAFIO_MIN * 60_000,
    allowCredentials: creds.map((c) => ({ id: c.credencial_id, transports: c.transportes ?? undefined })),
  });
  await guardarDesafio(usuarioId, "verificacion", opciones.challenge);
  return opciones;
}

export type ResultadoIdentidad =
  | { estado: "verificada" }
  | { estado: "sin_huella" } // la persona aún no activa su huella
  | { estado: "fallida"; motivo: string };

/**
 * Verifica la firma enviada al marcar. `respuestaJSON` viene del navegador;
 * todo se valida aquí: que la llave sea de ESTA persona, el desafío vigente,
 * el dominio, que se haya usado huella/rostro y el contador.
 */
export async function verificarIdentidad(usuarioId: string, respuestaJSON: string | null): Promise<ResultadoIdentidad> {
  const admin = createAdminClient();
  const { data: creds } = await admin
    .from("credenciales_identidad")
    .select("id, credencial_id, llave_publica, contador, transportes")
    .eq("usuario_id", usuarioId);

  if (!creds?.length) return { estado: "sin_huella" };
  if (!respuestaJSON) return { estado: "fallida", motivo: "No se confirmó con huella" };

  let respuesta: AuthenticationResponseJSON;
  try {
    respuesta = JSON.parse(respuestaJSON);
  } catch {
    return { estado: "fallida", motivo: "Respuesta de huella inválida" };
  }

  // La llave usada debe pertenecer a esta persona
  const cred = creds.find((c) => c.credencial_id === respuesta.id);
  if (!cred) return { estado: "fallida", motivo: "La huella no corresponde a esta cuenta" };

  const { rpID, origin } = await contexto();
  const vigentes = await desafiosVigentes(usuarioId, "verificacion");
  let usado = "";

  try {
    const v = await verifyAuthenticationResponse({
      response: respuesta,
      expectedChallenge: (c) => {
        usado = c;
        return vigentes.has(c);
      },
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credencial_id,
        publicKey: isoBase64URL.toBuffer(cred.llave_publica),
        counter: Number(cred.contador),
        transports: cred.transportes ?? undefined,
      },
    });
    if (usado) await marcarDesafioUsado(usuarioId, usado);
    if (!v.verified) return { estado: "fallida", motivo: "La huella no se pudo verificar" };

    await admin
      .from("credenciales_identidad")
      .update({ contador: v.authenticationInfo.newCounter, ultimo_uso: new Date().toISOString() })
      .eq("id", cred.id);

    return { estado: "verificada" };
  } catch (e) {
    if (usado) await marcarDesafioUsado(usuarioId, usado);
    console.error("[identidad] verificación", e);
    return { estado: "fallida", motivo: "La huella no se pudo verificar (desafío vencido o inválido)" };
  }
}
