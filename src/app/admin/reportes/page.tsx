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
import { cabeceraTabla, cajaTabla, cuerpoTabla, rotuloMovil, tabla } from "../estilos";

/** Celda numérica: en el teléfono, dato con su rótulo arriba. */
const celdaDato = "tabular-nums md:px-4 md:py-3 md:text-right";

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
    <div className="space-y-5 md:space-y-6">
      <h1 className="text-2xl text-noche-900">Reporte de horas y atrasos</h1>

      <FiltrosForm
        accion="/admin/reportes"
        filtros={filtros}
        empleados={empleados}
        exportar="jornadas"
      />

      {truncado && (
        <p className="rounded-xl bg-oro-50 p-3 text-sm text-oro-800">
          El período tiene más de {LIMITE_FILAS} jornadas y los totales están incompletos.
          Acota las fechas o filtra por persona.
        </p>
      )}

      {/* Tarjetas de totales */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tarjeta titulo="Horas trabajadas" valor={duracion(total.minutos)} destacada ancha />
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
          ancha
        />
      </section>

      {/* Resumen por persona */}
      <section className="space-y-2">
        <h2 className="text-lg text-noche-900">Resumen por persona</h2>
        <div className={cajaTabla}>
          <table className={`${tabla} md:min-w-[720px]`}>
            <thead className={cabeceraTabla}>
              <tr>
                <th className="px-4 py-3 font-semibold">Persona</th>
                <th className="px-4 py-3 text-right font-semibold">Días</th>
                <th className="px-4 py-3 text-right font-semibold">Horas trabajadas</th>
                <th className="px-4 py-3 text-right font-semibold">Promedio diario</th>
                <th className="px-4 py-3 text-right font-semibold">Atrasos</th>
                <th className="px-4 py-3 text-right font-semibold">Incompletas</th>
                <th className="px-4 py-3 text-right font-semibold">En revisión</th>
              </tr>
            </thead>
            <tbody className={cuerpoTabla}>
              {resumen.length === 0 && (
                <tr className="block md:table-row">
                  <td colSpan={7} className="block px-4 py-10 text-center text-tinta-500 md:table-cell">
                    No hay jornadas en este período.
                  </td>
                </tr>
              )}
              {resumen.map((r) => {
                const completos = r.dias - r.diasIncompletos;
                return (
                  <tr key={r.usuario_id} className="grid grid-cols-3 gap-x-3 gap-y-2 px-4 py-3 md:table-row">
                    <td className="col-span-3 md:px-4 md:py-3">
                      <p className="font-medium">{r.nombre}</p>
                      {r.rut && <p className="text-xs text-tinta-500">{r.rut}</p>}
                    </td>
                    <td className={celdaDato}>
                      <span className={rotuloMovil}>Días</span>
                      {r.dias}
                    </td>
                    <td className={celdaDato}>
                      <span className={rotuloMovil}>Horas</span>
                      {duracion(r.minutosTrabajados)}
                    </td>
                    <td className={celdaDato}>
                      <span className={rotuloMovil}>Promedio diario</span>
                      {completos ? duracion(Math.round(r.minutosTrabajados / completos)) : "—"}
                    </td>
                    <td className={celdaDato}>
                      <span className={rotuloMovil}>Atrasos</span>
                      {r.atrasos ? (
                        <span className="text-oro-700">
                          {r.atrasos} ({duracion(r.minutosAtraso)})
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className={celdaDato}>
                      <span className={rotuloMovil}>Incompletas</span>
                      {r.diasIncompletos}
                    </td>
                    <td className={celdaDato}>
                      <span className={rotuloMovil}>En revisión</span>
                      {r.marcasObservadas}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detalle diario */}
      <section className="space-y-2">
        <h2 className="text-lg text-noche-900">Detalle por día</h2>
        <div className={cajaTabla}>
          <table className={`${tabla} md:min-w-[800px]`}>
            <thead className={cabeceraTabla}>
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Persona</th>
                <th className="px-4 py-3 font-semibold">Horario</th>
                <th className="px-4 py-3 font-semibold">Entrada</th>
                <th className="px-4 py-3 font-semibold">Salida</th>
                <th className="px-4 py-3 text-right font-semibold">Trabajado</th>
                <th className="px-4 py-3 text-right font-semibold">Atraso</th>
              </tr>
            </thead>
            <tbody className={cuerpoTabla}>
              {jornadas.map((j) => (
                <tr
                  key={`${j.usuario_id}-${j.fecha}`}
                  className={`grid grid-cols-4 gap-x-2 gap-y-1.5 px-4 py-3 md:table-row ${
                    j.marcas_observadas > 0 ? "bg-oro-50/60" : ""
                  }`}
                >
                  <td className="col-span-2 col-start-3 row-start-1 text-right text-xs text-tinta-500 md:whitespace-nowrap md:px-4 md:py-3 md:text-left md:text-sm md:text-tinta-600">
                    {fecha(j.fecha)}
                  </td>
                  <td className="col-span-2 col-start-1 row-start-1 truncate font-medium md:px-4 md:py-3 md:font-normal">
                    {j.nombre}
                  </td>
                  <td className="col-span-4 text-xs tabular-nums text-tinta-500 md:px-4 md:py-3 md:text-sm">
                    {j.origen_horario === "libre" ? (
                      <span className="text-tinta-400">Día libre</span>
                    ) : j.hora_entrada_pactada ? (
                      <>
                        {horaPactada(j.hora_entrada_pactada)}–{horaPactada(j.hora_salida_pactada)}
                        {j.origen_horario === "turno" && (
                          <span className="ml-1.5 rounded bg-noche-100 px-1.5 py-0.5 text-xs font-medium text-noche-700">
                            Turno
                          </span>
                        )}
                      </>
                    ) : (
                      "Sin horario"
                    )}
                  </td>
                  <td className="tabular-nums md:px-4 md:py-3">
                    <span className={rotuloMovil}>Entrada</span>
                    {hora(j.entrada)}
                  </td>
                  <td className="tabular-nums md:px-4 md:py-3">
                    <span className={rotuloMovil}>Salida</span>
                    {hora(j.salida)}
                  </td>
                  <td className="tabular-nums md:px-4 md:py-3 md:text-right">
                    <span className={rotuloMovil}>Trabajado</span>
                    {j.minutos_trabajados === null ? (
                      <span className="text-oro-700">Incompleta</span>
                    ) : (
                      duracion(j.minutos_trabajados)
                    )}
                  </td>
                  <td className="tabular-nums md:px-4 md:py-3 md:text-right">
                    <span className={rotuloMovil}>Atraso</span>
                    {j.minutos_atraso > 0 ? (
                      <span className="font-medium text-oro-700">
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
        <p className="text-xs text-tinta-500">
          Las filas destacadas tienen al menos una marca en revisión. Las horas trabajadas son
          de entrada a salida (incluyen la colación). El atraso se calcula contra el turno de
          ese día o, si no hay, contra el horario base, y solo cuenta si supera la tolerancia.
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
  destacada,
  ancha,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  alerta?: boolean;
  /** El total principal, sobre el azul del logo */
  destacada?: boolean;
  /** Ocupa las dos columnas en el teléfono */
  ancha?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl p-4 shadow-sm ${
        destacada ? "bg-noche-900 text-white" : "bg-white ring-1 ring-tinta-200"
      } ${ancha ? "col-span-2 md:col-span-1" : ""}`}
    >
      <p className={`text-xs font-medium ${destacada ? "text-noche-100" : "text-tinta-500"}`}>{titulo}</p>
      <p
        className={`mt-1 font-titulo text-3xl font-medium ${
          destacada ? "" : alerta ? "text-oro-700" : "text-noche-900"
        }`}
      >
        {valor}
      </p>
      {detalle && <p className="mt-0.5 text-xs text-tinta-500">{detalle}</p>}
    </div>
  );
}
