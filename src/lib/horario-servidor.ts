/**
 * Horario efectivo de una persona en una fecha, leído de Supabase
 * (turno puntual > horario base de la semana A/B del ciclo).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { aMinutos, horarioEfectivo, type HorarioEfectivo } from "./horarios";

export async function horarioDelDia(
  db: SupabaseClient,
  usuarioId: string,
  fecha: string,
): Promise<HorarioEfectivo | null> {
  const [persona, base, turno] = await Promise.all([
    db.from("usuarios").select("ciclo_semanas, ciclo_inicio").eq("id", usuarioId).single(),
    db
      .from("horarios")
      .select("semana_ciclo, dia_semana, hora_entrada, hora_salida, tolerancia_minutos")
      .eq("usuario_id", usuarioId),
    db
      .from("turnos")
      .select("libre, hora_entrada, hora_salida, tolerancia_minutos")
      .eq("usuario_id", usuarioId)
      .eq("fecha", fecha)
      .maybeSingle(),
  ]);

  if (persona.error || base.error || turno.error) {
    console.error("[horario]", persona.error ?? base.error ?? turno.error);
    return null;
  }

  return horarioEfectivo({
    fecha,
    base: base.data ?? [],
    turno: turno.data,
    cicloSemanas: persona.data.ciclo_semanas,
    cicloInicio: persona.data.ciclo_inicio,
  });
}

/**
 * Compara la hora marcada con el horario:
 *  - entrada: minutos de atraso (si supera la tolerancia)
 *  - salida: minutos de salida anticipada (si supera la tolerancia)
 * Devuelve 0 si está dentro de lo permitido o null si no hay horario.
 */
export function desvio(
  tipo: "entrada" | "salida",
  horaMarcada: string, // "HH:MM" en hora de Chile
  h: HorarioEfectivo | null,
): number | null {
  if (!h || h.tipo !== "trabajo") return null;
  const diff =
    tipo === "entrada"
      ? aMinutos(horaMarcada) - aMinutos(h.entrada)
      : aMinutos(h.salida) - aMinutos(horaMarcada);
  return diff > h.tolerancia ? diff : 0;
}
