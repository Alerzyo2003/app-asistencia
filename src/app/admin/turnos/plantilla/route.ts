/**
 * GET /admin/turnos/plantilla?desde=YYYY-MM-DD&semanas=4
 * Descarga la planilla de turnos (lunes a sábado) para llenar y volver a subir.
 * Viene rellenada con lo que hoy tiene cada persona (turno puntual o base).
 */
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/auth";
import { ZONA_HORARIA } from "@/lib/config";
import { fechaHoy } from "@/lib/asistencia";
import { esFecha, fechasSemana, horarioEfectivo, lunesDe, sumarDias } from "@/lib/horarios";
import { textoTurno } from "@/lib/plantilla-turnos";
import { libroPlantillaTurnos, type FilaPlantilla } from "@/lib/excel";

export const dynamic = "force-dynamic";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: NextRequest) {
  const perfil = await obtenerPerfil();
  if (!perfil || perfil.rol !== "admin" || !perfil.activo) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const p = request.nextUrl.searchParams;
  const desdeCrudo = p.get("desde");
  const lunes = lunesDe(esFecha(desdeCrudo) ? desdeCrudo : fechaHoy(ZONA_HORARIA));
  const semanas = Math.min(8, Math.max(1, Number(p.get("semanas")) || 4));

  // Lunes a sábado de cada semana (domingo la clínica está cerrada)
  const fechas = Array.from({ length: semanas }, (_, i) => fechasSemana(sumarDias(lunes, i * 7)).slice(0, 6)).flat();
  const hasta = fechas[fechas.length - 1];

  const supabase = await createClient();
  const [personas, horarios, turnos] = await Promise.all([
    supabase.from("usuarios").select("id, usuario, nombre, ciclo_semanas, ciclo_inicio").eq("activo", true).order("nombre"),
    supabase.from("horarios").select("usuario_id, semana_ciclo, dia_semana, hora_entrada, hora_salida, tolerancia_minutos"),
    supabase
      .from("turnos")
      .select("usuario_id, fecha, libre, hora_entrada, hora_salida, tolerancia_minutos")
      .gte("fecha", lunes)
      .lte("fecha", hasta),
  ]);
  for (const r of [personas, horarios, turnos]) {
    if (r.error) return new NextResponse("No se pudo generar la planilla", { status: 500 });
  }

  const turnoDe = new Map((turnos.data ?? []).map((t) => [`${t.usuario_id}|${t.fecha}`, t]));
  const filas: FilaPlantilla[] = (personas.data ?? []).map((per) => {
    const base = (horarios.data ?? []).filter((h) => h.usuario_id === per.id);
    const valores: Record<string, string> = {};
    for (const fecha of fechas) {
      const e = horarioEfectivo({
        fecha,
        base,
        turno: turnoDe.get(`${per.id}|${fecha}`),
        cicloSemanas: per.ciclo_semanas,
        cicloInicio: per.ciclo_inicio,
      });
      valores[fecha] =
        e.tipo === "trabajo" ? textoTurno(e) : e.tipo === "libre" && e.origen === "turno" ? "libre" : "";
    }
    return { usuario: per.usuario, nombre: per.nombre, valores };
  });

  const titulo = `Turnos del ${lunes.split("-").reverse().join("-")} al ${hasta.split("-").reverse().join("-")}`;
  const archivo = await libroPlantillaTurnos({ fechas, filas, titulo });

  return new NextResponse(archivo as BodyInit, {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="turnos_${lunes}_a_${hasta}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
