/**
 * GET /admin/exportar?tipo=jornadas|marcas&desde=...&hasta=...&empleado=...&estado=...
 * Descarga un Excel (.xlsx) con formato.
 *
 *  - tipo=jornadas (botón del Reporte de horas): hoja Resumen + una hoja por
 *    persona con el detalle día a día (a tiempo, atraso, salida anticipada,
 *    ausencias).
 *  - tipo=marcas (botón de Registros): todas las marcas en una hoja.
 *
 * Los Route Handlers NO pasan por el layout de /admin, así que el chequeo de
 * rol se repite aquí (y además RLS limita lo que las consultas pueden leer).
 */
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/auth";
import { ZONA_HORARIA } from "@/lib/config";
import { ETIQUETAS, fechaHoy } from "@/lib/asistencia";
import { leerFiltros } from "@/lib/filtros";
import { exportarJornadas, exportarMarcas } from "@/lib/consultas";
import { hora } from "@/lib/formato";
import { calcularReporte, type PersonaReporte } from "@/lib/jornadas";
import { libroMarcas, libroReporte } from "@/lib/excel";

export const dynamic = "force-dynamic";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: NextRequest) {
  const perfil = await obtenerPerfil();
  if (!perfil || perfil.rol !== "admin" || !perfil.activo) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const filtros = leerFiltros(params, ZONA_HORARIA);
  const tipo = params.tipo === "marcas" ? "marcas" : "jornadas";
  const supabase = await createClient();

  const meta = {
    desde: filtros.desde,
    hasta: filtros.hasta,
    generado: new Intl.DateTimeFormat("es-CL", {
      timeZone: ZONA_HORARIA,
      dateStyle: "short",
      timeStyle: "short",
      hourCycle: "h23",
    }).format(new Date()),
  };

  let archivo: Uint8Array;

  try {
    if (tipo === "marcas") {
      const marcas = await exportarMarcas(supabase, filtros);
      archivo = await libroMarcas(
        // Más antiguo primero: se lee como un libro de asistencia
        [...marcas].reverse().map((m) => ({
          fecha: m.fecha,
          hora: hora(m.marcado_en),
          nombre: m.nombre,
          rut: m.rut,
          tipo: ETIQUETAS[m.tipo],
          valida: m.valida,
          motivo: m.valida ? null : m.motivo_observacion,
          distancia: m.distancia_m,
          precision: m.precision_m,
          ip: m.ip,
          conFoto: Boolean(m.foto_path),
          conHuella: Boolean(m.identidad_verificada),
        })),
        meta,
      );
    } else {
      archivo = await generarReporte(supabase, filtros, meta);
    }
  } catch (e) {
    console.error("[exportar]", e);
    return new NextResponse("No se pudo generar el archivo", { status: 500 });
  }

  const nombre =
    tipo === "marcas"
      ? `marcas_${filtros.desde}_a_${filtros.hasta}.xlsx`
      : `reporte_asistencia_${filtros.desde}_a_${filtros.hasta}.xlsx`;

  return new NextResponse(archivo as BodyInit, {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function generarReporte(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filtros: ReturnType<typeof leerFiltros>,
  meta: Parameters<typeof libroReporte>[1],
) {
  // El reporte por persona considera todas las marcas (válidas y en revisión):
  // las que están en revisión se muestran en "Observaciones".
  const filtrosTodas = { ...filtros, estado: "todas" as const };

  let qPersonas = supabase
    .from("usuarios")
    .select("id, nombre, rut, cargo, activo, ciclo_semanas, ciclo_inicio")
    .order("nombre");
  let qHorarios = supabase
    .from("horarios")
    .select("usuario_id, semana_ciclo, dia_semana, hora_entrada, hora_salida, tolerancia_minutos");
  let qTurnos = supabase
    .from("turnos")
    .select("usuario_id, fecha, libre, hora_entrada, hora_salida, tolerancia_minutos")
    .gte("fecha", filtros.desde)
    .lte("fecha", filtros.hasta);
  let qObservadas = supabase
    .from("asistencia")
    .select("usuario_id, fecha, tipo, motivo_observacion")
    .eq("valida", false)
    .gte("fecha", filtros.desde)
    .lte("fecha", filtros.hasta)
    .order("marcado_en");

  if (filtros.empleado) {
    qPersonas = qPersonas.eq("id", filtros.empleado);
    qHorarios = qHorarios.eq("usuario_id", filtros.empleado);
    qTurnos = qTurnos.eq("usuario_id", filtros.empleado);
    qObservadas = qObservadas.eq("usuario_id", filtros.empleado);
  }

  const [personas, horarios, turnos, observadas, jornadas] = await Promise.all([
    qPersonas,
    qHorarios,
    qTurnos,
    qObservadas,
    exportarJornadas(supabase, filtrosTodas),
  ]);

  for (const r of [personas, horarios, turnos, observadas]) {
    if (r.error) throw new Error(r.error.message);
  }

  // Personas: las activas + las inactivas que igual tengan marcas en el período
  const conMarcas = new Set(jornadas.map((j) => j.usuario_id));
  const lista: PersonaReporte[] = (personas.data ?? [])
    .filter((p) => p.activo || conMarcas.has(p.id))
    .map(({ id, nombre, rut, cargo, ciclo_semanas, ciclo_inicio }) => ({
      id,
      nombre,
      rut,
      cargo,
      ciclo_semanas,
      ciclo_inicio,
    }));

  const resumenes = calcularReporte({
    personas: lista,
    jornadas,
    horarios: horarios.data ?? [],
    turnos: turnos.data ?? [],
    observadas: observadas.data ?? [],
    desde: filtros.desde,
    hasta: filtros.hasta,
    hoy: fechaHoy(ZONA_HORARIA),
  });

  return libroReporte(resumenes, meta);
}
