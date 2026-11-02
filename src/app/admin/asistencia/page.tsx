/**
 * /admin/asistencia — Todas las marcaciones con filtros.
 */
import { CheckCircle2, Fingerprint, TriangleAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { ZONA_HORARIA } from "@/lib/config";
import { ETIQUETAS } from "@/lib/asistencia";
import { leerFiltros } from "@/lib/filtros";
import { LIMITE_FILAS, listarEmpleados, listarMarcas } from "@/lib/consultas";
import { fecha, hora } from "@/lib/formato";
import { urlsFirmadas } from "@/lib/fotos";
import { FiltrosForm } from "../FiltrosForm";
import { cabeceraTabla, cajaTabla, cuerpoTabla, tabla } from "../estilos";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** "Jorge Opazo" → "JO", para las filas sin foto en el teléfono. */
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

export default async function RegistrosPage({ searchParams }: Props) {
  const filtros = leerFiltros(await searchParams, ZONA_HORARIA);
  const supabase = await createClient();

  const [empleados, { filas, truncado }] = await Promise.all([
    listarEmpleados(supabase),
    listarMarcas(supabase, filtros),
  ]);

  const enRevision = filas.filter((f) => !f.valida).length;

  // Enlaces temporales (1 h) para ver las fotos del bucket privado.
  const fotos = await urlsFirmadas(filas.map((f) => f.foto_path ?? ""));

  return (
    <div className="space-y-4 md:space-y-5">
      <h1 className="text-2xl text-noche-900">Registros de asistencia</h1>

      <FiltrosForm
        accion="/admin/asistencia"
        filtros={filtros}
        empleados={empleados}
        exportar="marcas"
      />

      {/* Totales rápidos */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-white px-3 py-1 ring-1 ring-tinta-200">
          {filas.length} marcas
        </span>
        <span
          className={`rounded-full px-3 py-1 ring-1 ${
            enRevision ? "bg-oro-50 text-oro-800 ring-oro-200" : "bg-white ring-tinta-200"
          }`}
        >
          {enRevision} en revisión
        </span>
      </div>

      {truncado && (
        <p className="rounded-xl bg-oro-50 p-3 text-sm text-oro-800">
          Se muestran las {LIMITE_FILAS} marcas más recientes. Acota las fechas o exporta a
          Excel para ver el período completo.
        </p>
      )}

      <div className={cajaTabla}>
        <table className={`${tabla} md:min-w-[980px]`}>
          <thead className={cabeceraTabla}>
            <tr>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Hora</th>
              <th className="px-4 py-3 font-semibold">Persona</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Huella</th>
              <th className="px-4 py-3 font-semibold">Foto</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 text-right font-semibold">Distancia</th>
              <th className="px-4 py-3 text-right font-semibold">Precisión GPS</th>
              <th className="px-4 py-3 font-semibold">IP</th>
            </tr>
          </thead>
          <tbody className={cuerpoTabla}>
            {filas.length === 0 && (
              <tr className="block md:table-row">
                <td colSpan={10} className="block px-4 py-10 text-center text-tinta-500 md:table-cell">
                  No hay marcas para estos filtros.
                </td>
              </tr>
            )}

            {filas.map((m) => (
              <tr
                key={m.id}
                className={`grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-x-3 px-4 py-3 md:table-row ${
                  m.valida ? "" : "bg-oro-50/60"
                }`}
              >
                <td className="col-start-3 row-start-2 text-right text-xs text-tinta-500 md:whitespace-nowrap md:px-4 md:py-3 md:text-left md:text-sm md:text-tinta-600">
                  {fecha(m.fecha)}
                </td>
                <td className="col-start-3 row-start-1 text-right font-semibold tabular-nums md:px-4 md:py-3 md:text-left md:font-medium">
                  {hora(m.marcado_en)}
                </td>
                <td className="col-start-2 row-start-1 truncate font-medium md:px-4 md:py-3 md:font-normal">
                  {m.nombre}
                </td>
                <td className="col-start-2 row-start-2 flex items-center gap-1.5 text-xs text-tinta-600 md:table-cell md:px-4 md:py-3 md:text-sm md:text-inherit">
                  <span
                    className={`size-2 rounded-full md:hidden ${
                      m.tipo === "entrada"
                        ? "bg-turquesa-500"
                        : m.tipo === "salida"
                          ? "bg-oro-400"
                          : "bg-tinta-300"
                    }`}
                    aria-hidden
                  />
                  {ETIQUETAS[m.tipo]}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {m.identidad_verificada ? (
                    <Fingerprint className="size-5 text-verde-600" aria-label="Confirmada con huella" />
                  ) : (
                    <span className="text-tinta-300" title="Sin huella">—</span>
                  )}
                </td>
                <td className="col-start-1 row-span-3 row-start-1 md:px-4 md:py-2">
                  {m.foto_path && fotos.get(m.foto_path) ? (
                    <a
                      href={fotos.get(m.foto_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver foto"
                      className="block size-12 overflow-hidden rounded-2xl ring-1 ring-tinta-200 hover:ring-turquesa-400 md:size-10 md:rounded-lg"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fotos.get(m.foto_path)}
                        alt={`Foto de ${m.nombre}`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </a>
                  ) : (
                    <>
                      <span
                        className="flex size-12 items-center justify-center rounded-2xl bg-noche-50 text-sm font-semibold text-noche-500 md:hidden"
                        aria-hidden
                      >
                        {iniciales(m.nombre)}
                      </span>
                      <span className="hidden text-tinta-300 md:inline">—</span>
                    </>
                  )}
                </td>
                <td className="col-span-2 col-start-2 row-start-3 mt-1 md:mt-0 md:px-4 md:py-3">
                  {m.valida ? (
                    <span className="inline-flex items-center gap-1 text-verde-700">
                      <CheckCircle2 className="size-4" aria-hidden /> Válida
                    </span>
                  ) : (
                    <span className="inline-flex flex-col">
                      <span className="inline-flex items-center gap-1 font-medium text-oro-700">
                        <TriangleAlert className="size-4" aria-hidden /> En revisión
                      </span>
                      {m.motivo_observacion && (
                        <span className="max-w-xs text-xs text-oro-800">
                          {m.motivo_observacion}
                        </span>
                      )}
                    </span>
                  )}
                  {/* En el teléfono estos datos van juntos bajo el estado */}
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-tinta-500 tabular-nums md:hidden">
                    {m.identidad_verificada && (
                      <span className="inline-flex items-center gap-1 text-verde-700">
                        <Fingerprint className="size-3.5" aria-hidden /> Huella
                      </span>
                    )}
                    {m.distancia_m !== null && <span>A {Math.round(m.distancia_m)} m</span>}
                    {m.precision_m !== null && <span>GPS ±{Math.round(m.precision_m)} m</span>}
                    {m.ip && <span>IP {m.ip}</span>}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">
                  {m.distancia_m === null ? "—" : `${Math.round(m.distancia_m)} m`}
                </td>
                <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">
                  {m.precision_m === null ? "—" : `±${Math.round(m.precision_m)} m`}
                </td>
                <td className="hidden px-4 py-3 font-mono text-xs text-tinta-500 md:table-cell">
                  {m.ip ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
