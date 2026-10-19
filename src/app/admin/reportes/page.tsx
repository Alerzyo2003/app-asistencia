/**
 * /admin/reportes — Horas trabajadas y atrasos del período.
 * Parte de la vista v_jornadas (una fila por persona y día).
 */
import { createClient } from "@/lib/supabase/server";
import { ZONA_HORARIA } from "@/lib/config";
import { leerFiltros } from "@/lib/filtros";
import {
  LIMITE_FILAS,
  listarEmpleados,
  listarJornadas,
  resumirPorEmpleado,
} from "@/lib/consultas";
import { duracion, fecha, hora, horaPactada } from "@/lib/formato";
import { FiltrosForm } from "../FiltrosForm";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportesPage({ searchParams }: Props) {
  const filtros = leerFiltros(await searchParams, ZONA_HORARIA);
  const supabase = await createClient();

  const [empleados, { filas: jornadas, truncado }] = await Promise.all([
    listarEmpleados(supabase),
    listarJornadas(supabase, filtros),
  ]);

  const resumen = resumirPorEmpleado(jornadas);

  const total = resumen.reduce(
    (acc, r) => ({
      minutos: acc.minutos + r.minutosTrabajados,
      atrasos: acc.atrasos + r.atrasos,
      minutosAtraso: acc.minutosAtraso + r.minutosAtraso,
      incompletos: acc.incompletos + r.diasIncompletos,
      observadas: acc.observadas + r.marcasObservadas,
    }),
    { minutos: 0, atrasos: 0, minutosAtraso: 0, incompletos: 0, observadas: 0 },
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Reporte de horas y atrasos</h1>

      <FiltrosForm
        accion="/admin/reportes"
        filtros={filtros}
        empleados={empleados}
        exportar="jornadas"
      />

      {truncado && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          El período tiene más de {LIMITE_FILAS} jornadas y los totales están incompletos.
          Acota las fechas o filtra por persona.
        </p>
      )}

      {/* Tarjetas de totales */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tarjeta titulo="Horas trabajadas" valor={duracion(total.minutos)} />
        <Tarjeta
          titulo="Atrasos"
          valor={String(total.atrasos)}
          detalle={total.atrasos ? `${duracion(total.minutosAtraso)} en total` : undefined}
          alerta={total.atrasos > 0}
        />
        <Tarjeta
          titulo="Jornadas incompletas"
          valor={String(total.incompletos)}
          detalle="Sin entrada o sin salida"
          alerta={total.incompletos > 0}
        />
        <Tarjeta
          titulo="Marcas en revisión"
          valor={String(total.observadas)}
          alerta={total.observadas > 0}
        />
      </section>

      {/* Resumen por persona */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Resumen por persona</h2>
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Persona</th>
                <th className="px-4 py-3 text-right">Días</th>
                <th className="px-4 py-3 text-right">Horas trabajadas</th>
                <th className="px-4 py-3 text-right">Promedio diario</th>
                <th className="px-4 py-3 text-right">Atrasos</th>
                <th className="px-4 py-3 text-right">Incompletas</th>
                <th className="px-4 py-3 text-right">En revisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resumen.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No hay jornadas en este período.
                  </td>
                </tr>
              )}
              {resumen.map((r) => {
                const completos = r.dias - r.diasIncompletos;
                return (
                  <tr key={r.usuario_id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.nombre}</p>
                      {r.rut && <p className="text-xs text-slate-500">{r.rut}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.dias}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {duracion(r.minutosTrabajados)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {completos ? duracion(Math.round(r.minutosTrabajados / completos)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.atrasos ? (
                        <span className="text-amber-700">
                          {r.atrasos} ({duracion(r.minutosAtraso)})
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.diasIncompletos}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.marcasObservadas}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detalle diario */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Detalle por día</h2>
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Persona</th>
                <th className="px-4 py-3">Horario</th>
                <th className="px-4 py-3">Entrada</th>
                <th className="px-4 py-3">Colación</th>
                <th className="px-4 py-3">Salida</th>
                <th className="px-4 py-3 text-right">Trabajado</th>
                <th className="px-4 py-3 text-right">Atraso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jornadas.map((j) => (
                <tr
                  key={`${j.usuario_id}-${j.fecha}`}
                  className={j.marcas_observadas > 0 ? "bg-amber-50/40" : ""}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fecha(j.fecha)}</td>
                  <td className="px-4 py-3">{j.nombre}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">
                    {j.hora_entrada_pactada
                      ? `${horaPactada(j.hora_entrada_pactada)}–${horaPactada(j.hora_salida_pactada)}`
                      : "Sin horario"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{hora(j.entrada)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {j.inicio_colacion
                      ? `${hora(j.inicio_colacion)}–${hora(j.fin_colacion)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{hora(j.salida)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {j.minutos_trabajados === null ? (
                      <span className="text-amber-700">Incompleta</span>
                    ) : (
                      duracion(j.minutos_trabajados)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {j.minutos_atraso > 0 ? (
                      <span className="font-medium text-amber-700">
                        {duracion(j.minutos_atraso)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Las filas destacadas tienen al menos una marca en revisión. El atraso solo se cuenta
          cuando supera la tolerancia del horario de cada persona.
        </p>
      </section>
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  alerta,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${alerta ? "text-amber-700" : "text-slate-900"}`}>
        {valor}
      </p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}
