"use server";

/**
 * Acciones de planificación semanal de turnos.
 *
 * Regla: solo se guarda un turno cuando el día es DISTINTO del horario base.
 * Si el día coincide con el base, se borra el turno y manda el base. Así la
 * tabla `turnos` contiene solo las excepciones, y cambiar el horario base
 * sigue afectando a las semanas sin cambios.
 */

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { adminParaAccion } from "@/lib/auth";
import {
  TOLERANCIA_POR_DEFECTO,
  esFecha,
  fechasSemana,
  lunesDe,
  sumarDias,
  validarTramo,
  diaMes,
} from "@/lib/horarios";
import type { EstadoAccion } from "../personal/actions";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_AUTORIZADO: EstadoAccion = { ok: false, mensaje: "No tienes permisos para esto." };

type Base = { dia_semana: number; hora_entrada: string; hora_salida: string; tolerancia_minutos: number };

/** Lee y valida el lunes de la semana. */
function leerLunes(fd: FormData): string | null {
  const v = String(fd.get("lunes") ?? "");
  return esFecha(v) && lunesDe(v) === v ? v : null;
}

// ---------------------------------------------------------------------------
// Guardar la semana de una persona
// ---------------------------------------------------------------------------

export async function guardarSemana(_prev: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  if (!(await adminParaAccion())) return NO_AUTORIZADO;

  const usuarioId = String(fd.get("usuario_id") ?? "");
  const lunes = leerLunes(fd);
  if (!RE_UUID.test(usuarioId) || !lunes) return { ok: false, mensaje: "Datos no válidos." };

  const admin = createAdminClient();
  const fechas = fechasSemana(lunes);

  // Horario base de la persona (se consulta aquí: no se confía en el navegador)
  const { data: baseData, error: errorBase } = await admin
    .from("horarios")
    .select("dia_semana, hora_entrada, hora_salida, tolerancia_minutos")
    .eq("usuario_id", usuarioId);
  if (errorBase) return { ok: false, mensaje: "No se pudo leer el horario base." };

  const base = new Map<number, Base>(
    (baseData ?? []).map((b) => [
      b.dia_semana,
      { ...b, hora_entrada: b.hora_entrada.slice(0, 5), hora_salida: b.hora_salida.slice(0, 5) },
    ]),
  );

  const aGuardar: {
    usuario_id: string;
    fecha: string;
    libre: boolean;
    hora_entrada: string | null;
    hora_salida: string | null;
    tolerancia_minutos: number;
    updated_at: string;
  }[] = [];
  const aBorrar: string[] = [];
  const ahora = new Date().toISOString();

  for (let i = 0; i < 7; i++) {
    const fecha = fechas[i];
    const b = base.get(i + 1);
    const libre = fd.get(`libre_${i}`) === "on";
    const entrada = String(fd.get(`entrada_${i}`) ?? "").slice(0, 5);
    const salida = String(fd.get(`salida_${i}`) ?? "").slice(0, 5);

    if (!libre) {
      const error = validarTramo(diaMes(fecha), entrada, salida);
      if (error) return { ok: false, mensaje: error };
    }

    const igualAlBase = b
      ? !libre && entrada === b.hora_entrada && salida === b.hora_salida
      : libre; // sin base = no trabaja; "libre" coincide con eso

    if (igualAlBase) {
      aBorrar.push(fecha);
    } else {
      aGuardar.push({
        usuario_id: usuarioId,
        fecha,
        libre,
        hora_entrada: libre ? null : entrada,
        hora_salida: libre ? null : salida,
        tolerancia_minutos: b?.tolerancia_minutos ?? TOLERANCIA_POR_DEFECTO,
        updated_at: ahora,
      });
    }
  }

  if (aGuardar.length) {
    const { error } = await admin.from("turnos").upsert(aGuardar, { onConflict: "usuario_id,fecha" });
    if (error) {
      console.error("[turnos] upsert", error);
      return { ok: false, mensaje: "No se pudo guardar la semana." };
    }
  }

  if (aBorrar.length) {
    const { error } = await admin
      .from("turnos")
      .delete()
      .eq("usuario_id", usuarioId)
      .in("fecha", aBorrar);
    if (error) {
      console.error("[turnos] delete", error);
      return { ok: false, mensaje: "No se pudieron restablecer los días al horario base." };
    }
  }

  revalidatePath("/admin/turnos");
  return {
    ok: true,
    mensaje: aGuardar.length
      ? `Guardado: ${aGuardar.length} ${aGuardar.length === 1 ? "día distinto" : "días distintos"} del horario base.`
      : "Guardado: esta semana usa el horario base.",
  };
}

// ---------------------------------------------------------------------------
// Copiar la semana anterior (todo el equipo)
// ---------------------------------------------------------------------------

export async function copiarSemanaAnterior(_prev: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  if (!(await adminParaAccion())) return NO_AUTORIZADO;

  const lunes = leerLunes(fd);
  if (!lunes) return { ok: false, mensaje: "Semana no válida." };

  const admin = createAdminClient();
  const lunesAnterior = sumarDias(lunes, -7);
  const domingo = sumarDias(lunes, 6);

  const { data: anteriores, error: errorLeer } = await admin
    .from("turnos")
    .select("usuario_id, fecha, libre, hora_entrada, hora_salida, tolerancia_minutos")
    .gte("fecha", lunesAnterior)
    .lte("fecha", sumarDias(lunes, -1));
  if (errorLeer) return { ok: false, mensaje: "No se pudo leer la semana anterior." };

  // 1. Limpiar la semana actual
  const { error: errorBorrar } = await admin
    .from("turnos")
    .delete()
    .gte("fecha", lunes)
    .lte("fecha", domingo);
  if (errorBorrar) return { ok: false, mensaje: "No se pudo limpiar la semana actual." };

  // 2. Copiar desplazando 7 días
  if (anteriores?.length) {
    const ahora = new Date().toISOString();
    const { error } = await admin.from("turnos").insert(
      anteriores.map((t) => ({ ...t, fecha: sumarDias(t.fecha, 7), updated_at: ahora })),
    );
    if (error) {
      console.error("[turnos] copiar", error);
      return { ok: false, mensaje: "No se pudo copiar la semana anterior." };
    }
  }

  revalidatePath("/admin/turnos");
  return {
    ok: true,
    mensaje: anteriores?.length
      ? `Semana copiada (${anteriores.length} ${anteriores.length === 1 ? "cambio" : "cambios"} sobre el horario base).`
      : "La semana anterior usaba solo horarios base: esta semana quedó igual.",
  };
}
