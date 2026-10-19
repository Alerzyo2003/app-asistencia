"use server";

/**
 * Acción de servidor: registrar una marcación (entrada o salida).
 *
 * Recibe un FormData (para poder adjuntar la foto opcional):
 *   tipo, lat, lng, precision, foto (archivo JPEG, opcional)
 *
 * Flujo:
 *  1. Identifica al usuario por su sesión (cookies), nunca por un id enviado.
 *  2. Valida los datos (una Server Action es un endpoint público).
 *  3. Comprueba la secuencia del día (no hay salida sin entrada).
 *  4. Evalúa geocerca + red EN EL SERVIDOR.
 *  5. Sube la foto (si viene) a un bucket privado.
 *  6. Inserta con la clave secreta. La hora la pone la base de datos.
 *
 * Nota legal (Res. Ex. N°38/2024 DT): un sistema con geolocalización no puede
 * BLOQUEAR la marcación cuando la persona está fuera del lugar convenido.
 * Por eso nunca se rechaza por ubicación/red: se registra con `valida = false`.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluarGeocerca, esLecturaValida } from "@/lib/geo";
import { evaluarRed, obtenerIpCliente } from "@/lib/red";
import { obtenerConfigGeocerca, obtenerConfigRed, ZONA_HORARIA } from "@/lib/config";
import {
  ETIQUETAS,
  FOTO_MAX_BYTES,
  esTipoEvento,
  fechaHoy,
  siguientesPermitidos,
  type ResultadoMarcaje,
  type TipoRegistro,
} from "@/lib/asistencia";
import { BUCKET_FOTOS } from "@/lib/fotos";

/** Lee un número del FormData; null si viene vacío o no es número. */
function numero(fd: FormData, campo: string): number | null {
  const v = fd.get(campo);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valida la foto: debe ser un JPEG real (se revisan los primeros bytes, no
 * solo la extensión) y no superar el tamaño máximo.
 */
async function leerFoto(fd: FormData): Promise<{ bytes: Uint8Array } | { error: string } | null> {
  const archivo = fd.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) return null;
  if (archivo.size > FOTO_MAX_BYTES) return { error: "la foto es demasiado grande" };

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const esJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return esJpeg ? { bytes } : { error: "el archivo no es una foto válida" };
}

export async function registrarMarcaje(fd: FormData): Promise<ResultadoMarcaje> {
  // 1. ¿Quién es? -----------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, mensaje: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  // 2. Validación de entrada ------------------------------------------------
  const tipo = fd.get("tipo");
  if (!esTipoEvento(tipo)) {
    return { ok: false, mensaje: "Tipo de marcación no válido." };
  }

  const lectura = { lat: numero(fd, "lat"), lng: numero(fd, "lng"), precision: numero(fd, "precision") };
  const ubicacion = esLecturaValida(lectura) ? lectura : null;

  const admin = createAdminClient();

  const { data: perfil, error: errorPerfil } = await admin
    .from("usuarios")
    .select("activo")
    .eq("id", user.id)
    .single();

  if (errorPerfil || !perfil) {
    return { ok: false, mensaje: "No encontramos tu perfil. Avisa a administración." };
  }
  if (!perfil.activo) {
    return { ok: false, mensaje: "Tu usuario está desactivado." };
  }

  // 3. Secuencia del día ----------------------------------------------------
  const hoy = fechaHoy(ZONA_HORARIA);

  const { data: ultima, error: errorUltima } = await admin
    .from("asistencia")
    .select("tipo")
    .eq("usuario_id", user.id)
    .eq("fecha", hoy)
    .order("marcado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorUltima) {
    console.error("[marcaje] error leyendo última marca", errorUltima);
    return { ok: false, mensaje: "No pudimos verificar tus marcas de hoy. Intenta otra vez." };
  }

  const permitidos = siguientesPermitidos((ultima?.tipo ?? null) as TipoRegistro | null);

  if (!permitidos.includes(tipo)) {
    const sugerencia = permitidos.length
      ? `Ahora corresponde: ${permitidos.map((t) => ETIQUETAS[t]).join(" o ")}.`
      : "Tu jornada de hoy ya está cerrada.";
    return { ok: false, mensaje: `No puedes marcar "${ETIQUETAS[tipo]}" ahora. ${sugerencia}` };
  }

  // 4. Geocerca + red (siempre en servidor) --------------------------------
  const cabeceras = await headers();
  const geo = evaluarGeocerca(ubicacion, obtenerConfigGeocerca());
  const red = evaluarRed(obtenerIpCliente(cabeceras), obtenerConfigRed());

  const valida = geo.valida && red.valida;
  const motivo = [geo.motivo, red.motivo].filter(Boolean).join(" · ") || null;

  // 5. Foto opcional ----------------------------------------------------------
  // Si la foto falla, la marca se registra igual (la foto es opcional).
  let fotoPath: string | null = null;
  let avisoFoto: string | null = null;

  const foto = await leerFoto(fd);
  if (foto && "error" in foto) {
    avisoFoto = `No se guardó la foto: ${foto.error}.`;
  } else if (foto) {
    const ruta = `${user.id}/${hoy}/${tipo}-${Date.now()}.jpg`;
    const { error } = await admin.storage
      .from(BUCKET_FOTOS)
      .upload(ruta, foto.bytes, { contentType: "image/jpeg", upsert: false });
    if (error) {
      console.error("[marcaje] error subiendo foto", error);
      avisoFoto = "No se pudo guardar la foto.";
    } else {
      fotoPath = ruta;
    }
  }

  // 6. Insertar ---------------------------------------------------------------
  const { data: insertada, error: errorInsert } = await admin
    .from("asistencia")
    .insert({
      usuario_id: user.id,
      tipo,
      latitud: ubicacion?.lat ?? null,
      longitud: ubicacion?.lng ?? null,
      precision_m: ubicacion?.precision ?? null,
      distancia_m: geo.distanciaM,
      ip: red.ip,
      user_agent: cabeceras.get("user-agent")?.slice(0, 400) ?? null,
      valida,
      motivo_observacion: motivo,
      foto_path: fotoPath,
    })
    .select("marcado_en")
    .single();

  if (errorInsert) {
    // No dejar fotos huérfanas si la marca no se guardó.
    if (fotoPath) await admin.storage.from(BUCKET_FOTOS).remove([fotoPath]);

    // 23505 = violación de unique (usuario, fecha, tipo): doble clic o reintento
    if (errorInsert.code === "23505") {
      return { ok: false, mensaje: `Ya registraste "${ETIQUETAS[tipo]}" hoy.` };
    }
    console.error("[marcaje] error insertando", errorInsert);
    return { ok: false, mensaje: "No se pudo guardar la marcación. Intenta otra vez." };
  }

  revalidatePath("/marcar");

  const hora = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(new Date(insertada.marcado_en));

  const base = valida
    ? `${ETIQUETAS[tipo]} registrada a las ${hora}${fotoPath ? " con foto" : ""}.`
    : `${ETIQUETAS[tipo]} registrada a las ${hora}, pero quedó en revisión: ${motivo}`;

  return {
    ok: true,
    valida,
    marcadoEn: insertada.marcado_en,
    mensaje: avisoFoto ? `${base} ${avisoFoto}` : base,
  };
}
