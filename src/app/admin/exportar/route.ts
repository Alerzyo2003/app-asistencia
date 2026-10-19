/**
 * GET /admin/exportar?tipo=marcas|jornadas&desde=...&hasta=...&empleado=...&estado=...
 * Descarga un CSV que se abre directo en Excel.
 *
 * Los Route Handlers NO pasan por el layout de /admin, así que el chequeo de
 * rol se repite aquí (y además RLS limita lo que la consulta puede leer).
 */
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/auth";
import { ZONA_HORARIA } from "@/lib/config";
import { ETIQUETAS } from "@/lib/asistencia";
import { leerFiltros } from "@/lib/filtros";
import { exportarJornadas, exportarMarcas } from "@/lib/consultas";
import { fechaCorta, hhmm, hora, horaPactada } from "@/lib/formato";
import { generarCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const perfil = await obtenerPerfil();
  if (!perfil || perfil.rol !== "admin" || !perfil.activo) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const filtros = leerFiltros(params, ZONA_HORARIA);
  const tipo = params.tipo === "jornadas" ? "jornadas" : "marcas";
  const supabase = await createClient();

  let csv: string;

  try {
    if (tipo === "marcas") {
      const marcas = await exportarMarcas(supabase, filtros);
      csv = generarCsv(
        [
          "Fecha",
          "Hora",
          "Persona",
          "RUT",
          "Tipo",
          "Estado",
          "Motivo",
          "Distancia (m)",
          "Precisión GPS (m)",
          "Latitud",
          "Longitud",
          "IP",
        ],
        marcas.map((m) => [
          fechaCorta(m.fecha),
          hora(m.marcado_en),
          m.nombre,
          m.rut,
          ETIQUETAS[m.tipo],
          m.valida ? "Válida" : "En revisión",
          m.motivo_observacion,
          m.distancia_m === null ? null : Math.round(m.distancia_m),
          m.precision_m === null ? null : Math.round(m.precision_m),
          m.latitud,
          m.longitud,
          m.ip,
        ]),
      );
    } else {
      const jornadas = await exportarJornadas(supabase, filtros);
      csv = generarCsv(
        [
          "Fecha",
          "Persona",
          "RUT",
          "Entrada pactada",
          "Salida pactada",
          "Entrada",
          "Inicio colación",
          "Fin colación",
          "Salida",
          "Trabajado (h:mm)",
          "Trabajado (min)",
          "Atraso (min)",
          "Marcas en revisión",
        ],
        jornadas.map((j) => [
          fechaCorta(j.fecha),
          j.nombre,
          j.rut,
          j.hora_entrada_pactada ? horaPactada(j.hora_entrada_pactada) : null,
          j.hora_salida_pactada ? horaPactada(j.hora_salida_pactada) : null,
          j.entrada ? hora(j.entrada) : null,
          j.inicio_colacion ? hora(j.inicio_colacion) : null,
          j.fin_colacion ? hora(j.fin_colacion) : null,
          j.salida ? hora(j.salida) : null,
          j.minutos_trabajados === null ? "Incompleta" : hhmm(j.minutos_trabajados),
          j.minutos_trabajados,
          j.minutos_atraso,
          Number(j.marcas_observadas),
        ]),
      );
    }
  } catch (e) {
    console.error("[exportar]", e);
    return new NextResponse("No se pudo generar el archivo", { status: 500 });
  }

  const nombreArchivo = `asistencia_${tipo}_${filtros.desde}_a_${filtros.hasta}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
