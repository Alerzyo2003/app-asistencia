"use client";

/**
 * Editor del horario BASE semanal de una persona (lo habitual).
 * Las semanas distintas se ajustan en /admin/turnos sin tocar este horario.
 * El total semanal se recalcula en vivo; el servidor vuelve a validar todo.
 */

import { useActionState, useState } from "react";
import { CopyCheck, Save, TriangleAlert } from "lucide-react";

import { guardarHorario, type EstadoAccion } from "../actions";
import { BotonEnviar, MensajeAccion } from "../../ui";
import { botonPrimario, botonSecundario, campo } from "../../estilos";
import { duracion } from "@/lib/formato";
import {
  DIAS,
  JORNADA_MAX_SEMANAL_H,
  minutosDelDia,
  validarDia,
  type DiaHorario,
} from "@/lib/horarios";

type Fila = DiaHorario & { trabaja: boolean };

const VACIO: Omit<DiaHorario, "dia_semana"> = {
  hora_entrada: "08:30",
  hora_salida: "17:30",
  tolerancia_minutos: 5,
};

export function HorarioForm({ usuarioId, actual }: { usuarioId: string; actual: DiaHorario[] }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(guardarHorario, null);

  const [filas, setFilas] = useState<Fila[]>(() =>
    DIAS.map(({ n }) => {
      const h = actual.find((x) => x.dia_semana === n);
      return h
        ? { ...h, trabaja: true }
        : { dia_semana: n, ...VACIO, trabaja: false };
    }),
  );

  function cambiar(n: number, cambios: Partial<Fila>) {
    setFilas((prev) => prev.map((f) => (f.dia_semana === n ? { ...f, ...cambios } : f)));
  }

  /** Copia el horario del lunes a martes–viernes y los marca como laborables. */
  function copiarLunes() {
    const lunes = filas[0];
    setFilas((prev) =>
      prev.map((f) =>
        f.dia_semana >= 2 && f.dia_semana <= 5
          ? {
              ...f,
              trabaja: true,
              hora_entrada: lunes.hora_entrada,
              hora_salida: lunes.hora_salida,
              tolerancia_minutos: lunes.tolerancia_minutos,
            }
          : f,
      ),
    );
  }

  const totalSemana = filas.filter((f) => f.trabaja).reduce((a, f) => a + minutosDelDia(f), 0);
  const excede = totalSemana > JORNADA_MAX_SEMANAL_H * 60;

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="id" value={usuarioId} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-3">Día</th>
              <th className="px-2 py-2">Entrada</th>
              <th className="px-2 py-2">Salida</th>
              <th className="px-2 py-2">Tolerancia (min)</th>
              <th className="py-2 pl-2 text-right">Horas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((f) => {
              const dia = DIAS[f.dia_semana - 1];
              const error = f.trabaja ? validarDia(f) : null;
              return (
                <tr key={f.dia_semana} className={f.trabaja ? "" : "opacity-50"}>
                  <td className="py-2 pr-3">
                    <label className="flex items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        name={`trabaja_${f.dia_semana}`}
                        checked={f.trabaja}
                        onChange={(e) => cambiar(f.dia_semana, { trabaja: e.target.checked })}
                        className="size-4 accent-sky-600"
                      />
                      {dia.nombre}
                    </label>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="time"
                      name={`entrada_${f.dia_semana}`}
                      value={f.hora_entrada}
                      disabled={!f.trabaja}
                      onChange={(e) => cambiar(f.dia_semana, { hora_entrada: e.target.value })}
                      className={campo}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="time"
                      name={`salida_${f.dia_semana}`}
                      value={f.hora_salida}
                      disabled={!f.trabaja}
                      onChange={(e) => cambiar(f.dia_semana, { hora_salida: e.target.value })}
                      className={campo}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      name={`tolerancia_${f.dia_semana}`}
                      min={0}
                      max={60}
                      value={f.tolerancia_minutos}
                      disabled={!f.trabaja}
                      onChange={(e) =>
                        cambiar(f.dia_semana, { tolerancia_minutos: Number(e.target.value) })
                      }
                      className={campo}
                    />
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums">
                    {!f.trabaja ? (
                      "Libre"
                    ) : error ? (
                      <span className="text-xs text-rose-600">Revisar</span>
                    ) : (
                      duracion(minutosDelDia(f))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold">
              <td colSpan={4} className="py-3 pr-3 text-right text-slate-600">
                Total semanal
              </td>
              <td className={`py-3 pl-2 text-right tabular-nums ${excede ? "text-amber-700" : ""}`}>
                {duracion(totalSemana)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {excede && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Supera las {JORNADA_MAX_SEMANAL_H} horas semanales. Ojo: este total incluye la
          colación, que no cuenta como jornada. Revisa si corresponde o si parte son horas extra.
        </p>
      )}

      <MensajeAccion estado={estado} />

      <div className="flex flex-wrap gap-2">
        <BotonEnviar className={botonPrimario}>
          <Save className="size-4" aria-hidden /> Guardar horario base
        </BotonEnviar>
        <button type="button" onClick={copiarLunes} className={botonSecundario}>
          <CopyCheck className="size-4" aria-hidden /> Copiar lunes a mar–vie
        </button>
      </div>
    </form>
  );
}
