"use client";

/**
 * Una fila del planificador: la semana de una persona.
 * Cada día muestra el horario efectivo (turno o base). Las celdas que
 * difieren del horario base se destacan en violeta.
 */

import { useActionState, useState } from "react";
import { RotateCcw, Save } from "lucide-react";

import { guardarSemana } from "./actions";
import type { EstadoAccion } from "../personal/actions";
import { BotonEnviar, MensajeAccion } from "../ui";
import { duracion } from "@/lib/formato";
import { minutosTramo } from "@/lib/horarios";

export type Tramo = { entrada: string; salida: string };

export type CeldaDia = {
  fecha: string;
  /** Horario base de ese día de la semana (null = no trabaja normalmente) */
  base: Tramo | null;
  /** Lo que está guardado hoy para esa fecha: tramo o libre */
  efectivo: Tramo | "libre";
};

type Estado = { libre: boolean; entrada: string; salida: string };

const POR_DEFECTO: Tramo = { entrada: "08:30", salida: "17:30" };

function desdeEfectivo(c: CeldaDia): Estado {
  return c.efectivo === "libre"
    ? { libre: true, ...(c.base ?? POR_DEFECTO) }
    : { libre: false, ...c.efectivo };
}

function desdeBase(c: CeldaDia): Estado {
  return c.base ? { libre: false, ...c.base } : { libre: true, ...POR_DEFECTO };
}

function difiereDelBase(c: CeldaDia, e: Estado): boolean {
  if (!c.base) return !e.libre;
  return e.libre || e.entrada !== c.base.entrada || e.salida !== c.base.salida;
}

const campoHora =
  "w-full rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs tabular-nums outline-none focus:border-sky-500 disabled:bg-transparent disabled:text-slate-300";

export function FilaSemana({
  usuarioId,
  nombre,
  cargo,
  semana,
  otras = [],
  lunes,
  celdas,
}: {
  usuarioId: string;
  nombre: string;
  cargo: string | null;
  semana: string | null;
  /** Semanas de las otras personas, para "Copiar de…" */
  otras?: { id: string; nombre: string; celdas: CeldaDia[] }[];
  lunes: string;
  celdas: CeldaDia[];
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(guardarSemana, null);
  const [dias, setDias] = useState<Estado[]>(() => celdas.map(desdeEfectivo));

  // Si los datos del servidor cambian (p. ej. tras "Copiar semana anterior"),
  // se recargan las celdas sin perder el mensaje de la última acción.
  const firma = JSON.stringify(celdas.map((c) => c.efectivo));
  const [firmaPrevia, setFirmaPrevia] = useState(firma);
  if (firma !== firmaPrevia) {
    setFirmaPrevia(firma);
    setDias(celdas.map(desdeEfectivo));
  }

  const cambiar = (i: number, c: Partial<Estado>) =>
    setDias((prev) => prev.map((d, j) => (j === i ? { ...d, ...c } : d)));

  const total = dias.reduce((acc, d) => acc + (d.libre ? 0 : minutosTramo(d.entrada, d.salida)), 0);
  const hayCambios = dias.some((d, i) => difiereDelBase(celdas[i], d));

  return (
    <tr className="align-top">
      <td className="sticky left-0 z-[1] bg-white px-3 py-3">
        <p className="font-medium text-slate-900">{nombre}</p>
        {cargo && <p className="text-xs text-slate-500">{cargo}</p>}
        {semana && (
          <span className="mt-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700">
            Semana {semana}
          </span>
        )}
        <p className="mt-1 text-xs tabular-nums text-slate-500">{duracion(total)} / semana</p>
      </td>

      {dias.map((d, i) => {
        const distinto = difiereDelBase(celdas[i], d);
        return (
          <td key={celdas[i].fecha} className="px-1 py-2">
            <div
              className={`space-y-1 rounded-xl p-1.5 ${
                distinto ? "bg-violet-50 ring-1 ring-violet-300" : "bg-slate-50"
              }`}
            >
              <input
                form={`semana-${usuarioId}`}
                type="time"
                name={`entrada_${i}`}
                value={d.entrada}
                disabled={d.libre}
                onChange={(e) => cambiar(i, { entrada: e.target.value })}
                className={campoHora}
                aria-label={`Entrada ${celdas[i].fecha}`}
              />
              <input
                form={`semana-${usuarioId}`}
                type="time"
                name={`salida_${i}`}
                value={d.salida}
                disabled={d.libre}
                onChange={(e) => cambiar(i, { salida: e.target.value })}
                className={campoHora}
                aria-label={`Salida ${celdas[i].fecha}`}
              />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  form={`semana-${usuarioId}`}
                  type="checkbox"
                  name={`libre_${i}`}
                  checked={d.libre}
                  onChange={(e) => cambiar(i, { libre: e.target.checked })}
                  className="size-3.5 accent-violet-600"
                />
                Libre
              </label>
            </div>
          </td>
        );
      })}

      <td className="px-3 py-3">
        {/* El formulario está aquí; los inputs de las celdas se asocian con form="..." */}
        <form id={`semana-${usuarioId}`} action={accion} className="flex flex-col gap-2">
          <input type="hidden" name="usuario_id" value={usuarioId} />
          <input type="hidden" name="lunes" value={lunes} />
          <BotonEnviar className="inline-flex items-center justify-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
            <Save className="size-3.5" aria-hidden /> Guardar
          </BotonEnviar>
          <button
            type="button"
            onClick={() => setDias(celdas.map(desdeBase))}
            disabled={!hayCambios}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            title="Volver al horario base (luego presiona Guardar)"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Base
          </button>
          {otras.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const otra = otras.find((o) => o.id === e.target.value);
                if (otra) setDias(otra.celdas.map(desdeEfectivo));
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600"
              title="Copia la semana de otra persona en esta fila (luego presiona Guardar)"
              aria-label={`Copiar semana de otra persona a ${nombre}`}
            >
              <option value="">Copiar de…</option>
              {otras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          )}
        </form>
        <div className="mt-2 w-40">
          <MensajeAccion estado={estado} />
        </div>
      </td>
    </tr>
  );
}
