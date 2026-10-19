"use server";

/**
 * Acción de servidor: registrar una marcación.
 *
 * Flujo:
 *  1. Identifica al usuario por su sesión (cookies) — nunca por un id enviado
 *     desde el navegador.
 *  2. Valida la forma de los datos (una Server Action es un endpoint público).
 *  3. Comprueba la secuencia del día (no se puede marcar salida sin entrada).
 *  4. Evalúa geocerca + red EN EL SERVIDOR.
 *  5. Inserta con la clave secreta. La hora la pone la base de datos.
 *
 * Nota legal (Chile, Res. Ex. N°38/2024 DT): un sistema con geolocalización no
 * puede BLOQUEAR la marcación cuando la persona está fuera del lugar convenido.
 * Por eso aquí nunca se rechaza por ubicación/red: se registra igual con
 * `valida = false` y el motivo, para que la administración lo revise.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluarGeocerca, esLecturaValida } from "@/lib/geo";
import { evaluarRed, obtenerIpCliente } from "@/lib/red";
import {
  obtenerConfigGeocerca,
  obtenerConfigRed,
  ZONA_HORARIA,
} from "@/lib/config";
import {
  ETIQUETAS,
  esTipoEvento,
  fechaHoy,
  siguientesPermitidos,
  type ResultadoMarcaje,
  type SolicitudMarcaje,
  type TipoEvento,
} from "@/lib/asistencia";

export async function registrarMarcaje(
  solicitud: SolicitudMarcaje,
): Promise<ResultadoMarcaje> {
  // 1. ¿Quién es? -----------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, mensaje: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  // 2. Validación de entrada ------------------------------------------------
  if (!solicitud || !esTipoEvento(solicitud.tipo)) {
    return { ok: false, mensaje: "Tipo de marcación no válido." };
  }
  const ubicacion = esLecturaValida(solicitud.ubicacion)
    ? solicitud.ubicacion
    : null;

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

  const ultimoTipo = (ultima?.tipo ?? null) as TipoEvento | null;
  const permitidos = siguientesPermitidos(ultimoTipo);

  if (!permitidos.includes(solicitud.tipo)) {
    const sugerencia = permitidos.length
      ? `Ahora corresponde: ${permitidos.map((t) => ETIQUETAS[t]).join(" o ")}.`
      : "Tu jornada de hoy ya está cerrada.";
    return {
      ok: false,
      mensaje: `No puedes marcar "${ETIQUETAS[solicitud.tipo]}" ahora. ${sugerencia}`,
    };
  }

  // 4. Geocerca + red (siempre en servidor) --------------------------------
  const cabeceras = await headers();
  const geo = evaluarGeocerca(ubicacion, obtenerConfigGeocerca());
  const red = evaluarRed(obtenerIpCliente(cabeceras), obtenerConfigRed());

  const valida = geo.valida && red.valida;
  const motivo = [geo.motivo, red.motivo].filter(Boolean).join(" · ") || null;

  // 5. Insertar ---------------------------------------------------------------
  // marcado_en y fecha NO se envían: los pone la base de datos con now().
  const { data: insertada, error: errorInsert } = await admin
    .from("asistencia")
    .insert({
      usuario_id: user.id,
      tipo: solicitud.tipo,
      latitud: ubicacion?.lat ?? null,
      longitud: ubicacion?.lng ?? null,
      precision_m: ubicacion?.precision ?? null,
      distancia_m: geo.distanciaM,
      ip: red.ip,
      user_agent: cabeceras.get("user-agent")?.slice(0, 400) ?? null,
      valida,
      motivo_observacion: motivo,
    })
    .select("marcado_en")
    .single();

  if (errorInsert) {
    // 23505 = violación de unique (usuario, fecha, tipo): doble clic o reintento
    if (errorInsert.code === "23505") {
      return { ok: false, mensaje: `Ya registraste "${ETIQUETAS[solicitud.tipo]}" hoy.` };
    }
    console.error("[marcaje] error insertando", errorInsert);
    return { ok: false, mensaje: "No se pudo guardar la marcación. Intenta otra vez." };
  }

  revalidatePath("/marcar");

  const hora = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    hourCycle: "h23", // formato 24 h (14:50, no 02:50 p. m.)
    minute: "2-digit",
  }).format(new Date(insertada.marcado_en));

  return {
    ok: true,
    valida,
    marcadoEn: insertada.marcado_en,
    mensaje: valida
      ? `${ETIQUETAS[solicitud.tipo]} registrada a las ${hora}.`
      : `${ETIQUETAS[solicitud.tipo]} registrada a las ${hora}, pero quedó en revisión: ${motivo}`,
  };
}
