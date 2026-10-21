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
  horarioEfectivo,
} from "@/lib/horarios";
import { leerPlantillaTurnos } from "@/lib/excel";
import { leerTurno, normalizarTexto, resolverPersona } from "@/lib/plantilla-turnos";
import type { EstadoAccion } from "../personal/actions";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_AUTORIZADO: EstadoAccion = { ok: false, mensaje: "No tienes permisos para esto." };

type Base = { hora_entrada: string; hora_salida: string; tolerancia_minutos: number };

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

  // Horario base y ciclo de la persona (se consultan aquí: no se confía en el navegador)
  const [{ data: baseData, error: errorBase }, { data: persona, error: errorPersona }] =
    await Promise.all([
      admin
        .from("horarios")
        .select("semana_ciclo, dia_semana, hora_entrada, hora_salida, tolerancia_minutos")
        .eq("usuario_id", usuarioId),
      admin.from("usuarios").select("ciclo_semanas, ciclo_inicio").eq("id", usuarioId).single(),
    ]);
  if (errorBase || errorPersona) return { ok: false, mensaje: "No se pudo leer el horario base." };

  /** Horario base que corresponde a una fecha (semana A/B del ciclo). */
  const baseDe = (fecha: string): Base | undefined => {
    const e = horarioEfectivo({
      fecha,
      base: baseData ?? [],
      turno: null,
      cicloSemanas: persona.ciclo_semanas,
      cicloInicio: persona.ciclo_inicio,
    });
    return e.tipo === "trabajo"
      ? { hora_entrada: e.entrada, hora_salida: e.salida, tolerancia_minutos: e.tolerancia }
      : undefined;
  };

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
    const b = baseDe(fecha);
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

// ---------------------------------------------------------------------------
// Cargar planilla mensual (Excel)
// ---------------------------------------------------------------------------

/** Un cambio a aplicar: "libre", "HH:MM-HH:MM" o "base" (volver al horario base). */
export type CambioPlantilla = {
  usuarioId: string;
  persona: string;
  fecha: string;
  valor: string;
  motivo?: string; // "feriado", "libre"… (solo informativo)
};

export type VistaPrevia =
  | {
      ok: true;
      cambios: CambioPlantilla[];
      errores: string[];
      personas: number;
      desde: string;
      hasta: string;
    }
  | { ok: false; mensaje: string };

const MAX_BYTES_PLANTILLA = 2 * 1024 * 1024;
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const etiquetaFecha = (f: string) =>
  `${DIAS_CORTOS[new Date(`${f}T00:00:00Z`).getUTCDay()]} ${f.slice(8, 10)}-${f.slice(5, 7)}`;

/** Paso 1: lee el Excel y muestra qué se va a cambiar (sin guardar nada). */
export async function previsualizarPlantilla(_prev: VistaPrevia | null, fd: FormData): Promise<VistaPrevia> {
  if (!(await adminParaAccion())) return { ok: false, mensaje: "No tienes permisos para esto." };

  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: "Elige el archivo Excel." };
  if (archivo.size > MAX_BYTES_PLANTILLA) return { ok: false, mensaje: "El archivo es demasiado grande." };

  let leida;
  try {
    leida = await leerPlantillaTurnos(await archivo.arrayBuffer());
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
  if (leida.fechas.length > 62) return { ok: false, mensaje: "La planilla tiene demasiados días (máximo 2 meses)." };

  const { data: personas, error } = await createAdminClient()
    .from("usuarios")
    .select("id, usuario, nombre")
    .eq("activo", true);
  if (error) return { ok: false, mensaje: "No se pudo leer el personal." };

  const cambios: CambioPlantilla[] = [];
  const errores: string[] = [];
  const vistos = new Set<string>();

  for (const fila of leida.filas) {
    const r = resolverPersona(fila.clave, personas ?? []);
    if (!r.ok) {
      errores.push(`Fila ${fila.numeroFila}: ${r.error}`);
      continue;
    }
    if (vistos.has(r.persona.id)) {
      errores.push(`Fila ${fila.numeroFila}: ${r.persona.nombre} aparece dos veces; se usa solo la primera.`);
      continue;
    }
    vistos.add(r.persona.id);

    for (const { fecha, texto } of fila.valores) {
      const v = leerTurno(texto);
      if (v.tipo === "error") {
        errores.push(`${r.persona.nombre}, ${etiquetaFecha(fecha)}: no se entiende "${v.texto}" (se dejó sin cambio).`);
        continue;
      }
      if (v.tipo === "base") {
        // Celda vacía: no se toca, salvo que diga "base" explícitamente
        if (normalizarTexto(texto) === "base") {
          cambios.push({ usuarioId: r.persona.id, persona: r.persona.nombre, fecha, valor: "base" });
        }
        continue;
      }
      cambios.push({
        usuarioId: r.persona.id,
        persona: r.persona.nombre,
        fecha,
        valor: v.tipo === "libre" ? "libre" : `${v.entrada}-${v.salida}`,
        motivo: v.tipo === "libre" ? v.motivo : undefined,
      });
    }
  }

  return {
    ok: true,
    cambios,
    errores,
    personas: vistos.size,
    desde: leida.fechas[0],
    hasta: leida.fechas[leida.fechas.length - 1],
  };
}

/**
 * Paso 2: guarda los turnos. Se vuelve a validar todo en el servidor.
 * Si un día queda igual a su horario base, se borra el turno (manda el base).
 */
export async function aplicarPlantilla(cambiosJSON: string): Promise<{ ok: boolean; mensaje: string }> {
  if (!(await adminParaAccion())) return { ok: false, mensaje: "No tienes permisos para esto." };

  let cambios: CambioPlantilla[];
  try {
    cambios = JSON.parse(cambiosJSON);
    if (!Array.isArray(cambios) || cambios.length > 5000) throw new Error();
  } catch {
    return { ok: false, mensaje: "Datos no válidos." };
  }

  // Validación de cada cambio
  const RE_TRAMO = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/;
  for (const c of cambios) {
    if (!RE_UUID.test(c.usuarioId) || !esFecha(c.fecha)) return { ok: false, mensaje: "Datos no válidos." };
    if (c.valor !== "libre" && c.valor !== "base") {
      const m = c.valor.match(RE_TRAMO);
      if (!m || validarTramo(c.fecha, m[1], m[2])) return { ok: false, mensaje: `Turno no válido: ${c.valor}` };
    }
  }

  const admin = createAdminClient();
  const ids = [...new Set(cambios.map((c) => c.usuarioId))];
  const [{ data: personas }, { data: bases }] = await Promise.all([
    admin.from("usuarios").select("id, ciclo_semanas, ciclo_inicio").in("id", ids),
    admin
      .from("horarios")
      .select("usuario_id, semana_ciclo, dia_semana, hora_entrada, hora_salida, tolerancia_minutos")
      .in("usuario_id", ids),
  ]);
  const personaDe = new Map((personas ?? []).map((p) => [p.id, p]));

  const aGuardar: Record<string, unknown>[] = [];
  const aBorrar: { usuarioId: string; fecha: string }[] = [];
  const ahora = new Date().toISOString();

  for (const c of cambios) {
    const p = personaDe.get(c.usuarioId);
    if (!p) continue;
    const base = (bases ?? []).filter((b) => b.usuario_id === c.usuarioId);
    const e = horarioEfectivo({ fecha: c.fecha, base, turno: null, cicloSemanas: p.ciclo_semanas, cicloInicio: p.ciclo_inicio });
    const tolerancia = e.tipo === "trabajo" ? e.tolerancia : TOLERANCIA_POR_DEFECTO;

    if (c.valor === "base") {
      aBorrar.push({ usuarioId: c.usuarioId, fecha: c.fecha });
      continue;
    }
    const libre = c.valor === "libre";
    const [entrada, salida] = libre ? [null, null] : c.valor.split("-");
    const igualAlBase =
      (libre && e.tipo !== "trabajo") || (!libre && e.tipo === "trabajo" && e.entrada === entrada && e.salida === salida);

    if (igualAlBase) aBorrar.push({ usuarioId: c.usuarioId, fecha: c.fecha });
    else
      aGuardar.push({
        usuario_id: c.usuarioId,
        fecha: c.fecha,
        libre,
        hora_entrada: entrada,
        hora_salida: salida,
        tolerancia_minutos: tolerancia,
        updated_at: ahora,
      });
  }

  for (let i = 0; i < aGuardar.length; i += 500) {
    const { error } = await admin.from("turnos").upsert(aGuardar.slice(i, i + 500), { onConflict: "usuario_id,fecha" });
    if (error) {
      console.error("[plantilla] upsert", error);
      return { ok: false, mensaje: "No se pudieron guardar los turnos. No se completó la carga." };
    }
  }

  // Borrados agrupados por persona
  for (const id of new Set(aBorrar.map((b) => b.usuarioId))) {
    const fechas = aBorrar.filter((b) => b.usuarioId === id).map((b) => b.fecha);
    const { error } = await admin.from("turnos").delete().eq("usuario_id", id).in("fecha", fechas);
    if (error) console.error("[plantilla] delete", error);
  }

  revalidatePath("/admin/turnos");
  revalidatePath("/admin/reportes");
  return {
    ok: true,
    mensaje: `Planilla cargada: ${cambios.length} días de ${ids.length} ${ids.length === 1 ? "persona" : "personas"}.`,
  };
}
