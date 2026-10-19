/**
 * /admin/asistencia — Todas las marcaciones con filtros.
 */
import { CheckCircle2, TriangleAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { ZONA_HORARIA } from "@/lib/config";
import { ETIQUETAS } from "@/lib/asistencia";
import { leerFiltros } from "@/lib/filtros";
import { LIMITE_FILAS, listarEmpleados, listarMarcas } from "@/lib/consultas";
import { fecha, hora } from "@/lib/formato";
import { urlsFirmadas } from "@/lib/fotos";
import { FiltrosForm } from "../FiltrosForm";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Registros de asistencia</h1>

      <FiltrosForm
        accion="/admin/asistencia"
        filtros={filtros}
        empleados={empleados}
        exportar="marcas"
      />

      {/* Totales rápidos */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
          {filas.length} marcas
        </span>
        <span
          className={`rounded-full px-3 py-1 ring-1 ${
            enRevision ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-white ring-slate-200"
          }`}
        >
          {enRevision} en revisión
        </span>
      </div>

      {truncado && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Se muestran las {LIMITE_FILAS} marcas más recientes. Acota las fechas o exporta a
          Excel para ver el período completo.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Hora</th>
              <th className="px-4 py-3">Persona</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Foto</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Distancia</th>
              <th className="px-4 py-3 text-right">Precisión GPS</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  No hay marcas para estos filtros.
                </td>
              </tr>
            )}

            {filas.map((m) => (
              <tr key={m.id} className={m.valida ? "" : "bg-amber-50/40"}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fecha(m.fecha)}</td>
                <td className="px-4 py-3 font-medium tabular-nums">{hora(m.marcado_en)}</td>
                <td className="px-4 py-3">{m.nombre}</td>
                <td className="px-4 py-3">{ETIQUETAS[m.tipo]}</td>
                <td className="px-4 py-2">
                  {m.foto_path && fotos.get(m.foto_path) ? (
                    <a
                      href={fotos.get(m.foto_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver foto"
                      className="block size-10 overflow-hidden rounded-lg ring-1 ring-slate-200 hover:ring-sky-400"
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
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {m.valida ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="size-4" aria-hidden /> Válida
                    </span>
                  ) : (
                    <span className="inline-flex flex-col">
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                        <TriangleAlert className="size-4" aria-hidden /> En revisión
                      </span>
                      {m.motivo_observacion && (
                        <span className="max-w-xs text-xs text-amber-800">
                          {m.motivo_observacion}
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {m.distancia_m === null ? "—" : `${Math.round(m.distancia_m)} m`}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {m.precision_m === null ? "—" : `±${Math.round(m.precision_m)} m`}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
