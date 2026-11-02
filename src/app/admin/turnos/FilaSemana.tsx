"use client";

/**
 * Una fila del planificador: la semana de una persona.
 * Cada día muestra el horario efectivo (turno o base). Las celdas que
 * difieren del horario base se destacan en dorado.
 *
 * En el teléfono la fila es una ficha plegable: muestra el resumen de la
 * semana y al tocarla despliega un día por línea. Los campos plegados siguen
 * en el formulario, por eso se ocultan con CSS y no se dejan de dibujar.
 */

import { useActionState, useState } from "react";
import { ChevronDown, RotateCcw, Save } from "lucide-react";

import { guardarSemana } from "./actions";
import type { EstadoAccion } from "../personal/actions";
import { BotonEnviar, MensajeAccion } from "../ui";
import { duracion } from "@/lib/formato";
import { DIAS, diaMes, minutosTramo } from "@/lib/horarios";

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
  "w-full min-w-0 rounded-lg border border-tinta-300 bg-white px-1.5 py-1.5 text-base tabular-nums outline-none focus:border-turquesa-500 disabled:bg-transparent disabled:text-tinta-300 md:py-1 md:text-xs";

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
  const [abierta, setAbierta] = useState(false);

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
    <tr className="block align-top md:table-row">
      <td className="relative block bg-white px-4 py-3 md:sticky md:left-0 md:z-[1] md:table-cell md:px-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-tinta-900">{nombre}</p>
            {cargo && <p className="text-xs text-tinta-500">{cargo}</p>}
            {semana && (
              <span className="mt-1 inline-block rounded bg-noche-100 px-1.5 py-0.5 text-xs font-medium text-noche-700">
                Semana {semana}
              </span>
            )}
            <p className="mt-1 text-xs tabular-nums text-tinta-500">{duracion(total)} / semana</p>
          </div>

          {/* Resumen y control para plegar, solo en el teléfono */}
          <button
            type="button"
            onClick={() => setAbierta((a) => !a)}
            aria-expanded={abierta}
            aria-label={`${abierta ? "Ocultar" : "Ver"} la semana de ${nombre}`}
            className="flex items-center gap-2 after:absolute after:inset-0 md:hidden"
          >
            <span className="flex gap-0.5" aria-hidden>
              {dias.map((d, i) => (
                <span
                  key={celdas[i].fecha}
                  className={`w-5 rounded py-0.5 text-center text-xs ${
                    difiereDelBase(celdas[i], d)
                      ? "bg-oro-200 font-semibold text-oro-900"
                      : d.libre
                        ? "text-tinta-300"
                        : "bg-turquesa-100 font-semibold text-turquesa-900"
                  }`}
                >
                  {DIAS[i].corto[0]}
                </span>
              ))}
            </span>
            <ChevronDown
              className={`size-5 text-tinta-400 transition-transform ${abierta ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        </div>
      </td>

      {dias.map((d, i) => {
        const distinto = difiereDelBase(celdas[i], d);
        return (
          <td
            key={celdas[i].fecha}
            className={`${abierta ? "block" : "hidden"} px-4 py-0.5 md:table-cell md:px-1 md:py-2`}
          >
            <div
              className={`grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5 rounded-xl p-1.5 md:block md:space-y-1 ${
                distinto ? "bg-oro-50 ring-1 ring-oro-400" : "bg-tinta-50"
              }`}
            >
              <span className="text-xs leading-tight md:hidden">
                <span className="block font-semibold">{DIAS[i].corto}</span>
                <span className="tabular-nums text-tinta-500">{diaMes(celdas[i].fecha)}</span>
              </span>
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
              <label className="flex items-center gap-1 text-xs text-tinta-600">
                <input
                  form={`semana-${usuarioId}`}
                  type="checkbox"
                  name={`libre_${i}`}
                  checked={d.libre}
                  onChange={(e) => cambiar(i, { libre: e.target.checked })}
                  className="size-5 accent-noche-900 md:size-3.5"
                />
                Libre
              </label>
            </div>
          </td>
        );
      })}

      <td className={`${abierta ? "block" : "hidden"} px-4 py-3 md:table-cell md:px-3`}>
        {/* El formulario está aquí; los inputs de las celdas se asocian con form="..." */}
        <form
          id={`semana-${usuarioId}`}
          action={accion}
          className="grid grid-cols-2 gap-2 md:flex md:flex-col"
        >
          <input type="hidden" name="usuario_id" value={usuarioId} />
          <input type="hidden" name="lunes" value={lunes} />
          <BotonEnviar className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-noche-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-noche-700 disabled:opacity-60 md:min-h-0 md:text-xs">
            <Save className="size-3.5" aria-hidden /> Guardar
          </BotonEnviar>
          <button
            type="button"
            onClick={() => setDias(celdas.map(desdeBase))}
            disabled={!hayCambios}
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-tinta-300 px-3 py-1.5 text-sm font-medium text-tinta-600 hover:bg-tinta-50 disabled:opacity-40 md:min-h-0 md:text-xs"
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
              className="col-span-2 w-full min-w-0 rounded-lg border border-tinta-300 bg-white px-2 py-2.5 text-base text-tinta-600 md:py-1.5 md:text-xs"
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
        <div className="mt-2 md:w-40">
          <MensajeAccion estado={estado} />
        </div>
      </td>
    </tr>
  );
}
