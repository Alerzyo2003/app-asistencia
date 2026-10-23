"use client";

/**
 * Editor del horario BASE de una persona, con turnos rotativos.
 *
 * - "Se repite cada": 1 semana (siempre igual) o 2–4 semanas (Semana A, B…
 *   intercaladas, p. ej. mañana / tarde).
 * - "La Semana A empieza el lunes…": ancla del ciclo. Con eso la app sabe
 *   sola qué semana le toca a cada fecha, para siempre.
 * - Cambios puntuales de un día se siguen haciendo en /admin/turnos.
 *
 * Todas las semanas se envían en el mismo formulario (las pestañas solo
 * ocultan/muestran); el servidor vuelve a validar todo.
 */

import { useActionState, useState } from "react";
import { CalendarSync, ClipboardCopy, Copy, CopyCheck, Save, TriangleAlert } from "lucide-react";

import { guardarHorario, type EstadoAccion } from "../actions";
import { BotonEnviar, MensajeAccion } from "../../ui";
import { botonPrimario, botonSecundario, campo, etiqueta } from "../../estilos";
import { duracion } from "@/lib/formato";
import {
  DIAS,
  JORNADA_MAX_SEMANAL_H,
  MAX_SEMANAS_CICLO,
  diaMes,
  letraSemana,
  minutosDelDia,
  semanaDelCiclo,
  validarDia,
  type DiaHorario,
} from "@/lib/horarios";

export type HorarioCiclo = DiaHorario & { semana_ciclo: number };

/** Horario de otra persona, para copiarlo con "Copiar horario de…". */
export type HorarioOtraPersona = {
  id: string;
  nombre: string;
  cicloSemanas: number;
  cicloInicio: string | null;
  horarios: HorarioCiclo[];
};

type Fila = DiaHorario & { trabaja: boolean };

const VACIO: Omit<DiaHorario, "dia_semana"> = {
  hora_entrada: "08:30",
  hora_salida: "17:30",
  tolerancia_minutos: 5,
};

function semanaInicial(actual: HorarioCiclo[], s: number): Fila[] {
  return DIAS.map(({ n }) => {
    const h = actual.find((x) => x.semana_ciclo === s && x.dia_semana === n);
    return h
      ? { dia_semana: n, hora_entrada: h.hora_entrada, hora_salida: h.hora_salida, tolerancia_minutos: h.tolerancia_minutos, trabaja: true }
      : { dia_semana: n, ...VACIO, trabaja: false };
  });
}

export function HorarioForm({
  usuarioId,
  actual,
  cicloSemanas,
  cicloInicio,
  hoy,
  lunesActual,
  otras = [],
}: {
  usuarioId: string;
  actual: HorarioCiclo[];
  cicloSemanas: number;
  cicloInicio: string | null;
  hoy: string;
  lunesActual: string;
  /** Otras personas con horario, para copiar el suyo */
  otras?: HorarioOtraPersona[];
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(guardarHorario, null);

  const [ciclo, setCiclo] = useState(cicloSemanas);
  const [inicio, setInicio] = useState(cicloInicio ?? lunesActual);
  const [pestana, setPestana] = useState(1);
  const [semanas, setSemanas] = useState<Fila[][]>(() =>
    Array.from({ length: MAX_SEMANAS_CICLO }, (_, i) => semanaInicial(actual, i + 1)),
  );

  const [copiadoDe, setCopiadoDe] = useState<string | null>(null);

  /**
   * Carga en el formulario el horario de otra persona (días, horas, tolerancia,
   * rotación A/B y lunes de inicio). No se guarda hasta presionar "Guardar".
   */
  function copiarDe(id: string) {
    const otra = otras.find((o) => o.id === id);
    if (!otra) return;
    setCiclo(otra.cicloSemanas);
    setInicio(otra.cicloInicio ?? lunesActual);
    setSemanas(Array.from({ length: MAX_SEMANAS_CICLO }, (_, i) => semanaInicial(otra.horarios, i + 1)));
    setPestana(1);
    setCopiadoDe(otra.nombre);
  }

  const actualCiclo = semanaDelCiclo(hoy, inicio, ciclo);
  const filas = semanas[pestana - 1];

  function cambiar(s: number, n: number, cambios: Partial<Fila>) {
    setSemanas((prev) =>
      prev.map((sem, i) => (i === s - 1 ? sem.map((f) => (f.dia_semana === n ? { ...f, ...cambios } : f)) : sem)),
    );
  }

  /** Copia el lunes a martes–viernes en la semana visible. */
  function copiarLunes() {
    const lunes = filas[0];
    setSemanas((prev) =>
      prev.map((sem, i) =>
        i === pestana - 1
          ? sem.map((f) =>
              f.dia_semana >= 2 && f.dia_semana <= 5
                ? { ...f, trabaja: true, hora_entrada: lunes.hora_entrada, hora_salida: lunes.hora_salida, tolerancia_minutos: lunes.tolerancia_minutos }
                : f,
            )
          : sem,
      ),
    );
  }

  /** Copia la Semana A completa a la semana visible (para luego cambiar solo las horas). */
  function copiarDeA() {
    setSemanas((prev) => prev.map((sem, i) => (i === pestana - 1 ? prev[0].map((f) => ({ ...f })) : sem)));
  }

  const totalDe = (sem: Fila[]) => sem.filter((f) => f.trabaja).reduce((a, f) => a + minutosDelDia(f), 0);
  const totalVisible = totalDe(filas);
  const excede = totalVisible > JORNADA_MAX_SEMANAL_H * 60;

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="id" value={usuarioId} />

      {/* Copiar el horario de otra persona */}
      {otras.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-sky-300 bg-sky-50/50 p-3 sm:flex-row sm:items-center">
          <label htmlFor="copiar-de" className="flex items-center gap-1.5 text-sm font-medium text-sky-900">
            <ClipboardCopy className="size-4" aria-hidden /> Copiar horario de
          </label>
          <select
            id="copiar-de"
            value=""
            onChange={(e) => copiarDe(e.target.value)}
            className={`${campo} sm:max-w-xs`}
          >
            <option value="">Elegir persona…</option>
            {otras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
                {o.cicloSemanas > 1 ? ` (rotativo ${o.cicloSemanas} sem.)` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {copiadoDe && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Se copió el horario de <strong>{copiadoDe}</strong>. Ajusta lo que necesites y presiona{" "}
          <strong>Guardar horario</strong> (aún no se ha guardado).
        </p>
      )}

      {/* Configuración del ciclo */}
      <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={etiqueta}>¿Cada cuánto se repite su horario?</span>
          <select
            name="ciclo_semanas"
            value={ciclo}
            onChange={(e) => {
              const n = Number(e.target.value);
              setCiclo(n);
              if (pestana > n) setPestana(1);
            }}
            className={campo}
          >
            <option value={1}>Todas las semanas igual</option>
            <option value={2}>Cada 2 semanas (turnos A / B intercalados)</option>
            <option value={3}>Cada 3 semanas (A / B / C)</option>
            <option value={4}>Cada 4 semanas (A / B / C / D)</option>
          </select>
        </label>

        {ciclo > 1 && (
          <label className="space-y-1">
            <span className={etiqueta}>La Semana A comienza el lunes</span>
            <input
              type="date"
              name="ciclo_inicio"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className={campo}
              required
            />
          </label>
        )}

        {ciclo > 1 && (
          <p className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <CalendarSync className="size-4 text-violet-600" aria-hidden />
            Esta semana (lunes {diaMes(lunesActual)}) le toca la{" "}
            <strong className="text-violet-700">Semana {letraSemana(actualCiclo)}</strong>. Luego se
            alternan solas.
          </p>
        )}
      </div>

      {/* Pestañas de semanas */}
      {ciclo > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
          {Array.from({ length: ciclo }, (_, i) => i + 1).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={pestana === s}
              onClick={() => setPestana(s)}
              className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-medium ${
                pestana === s
                  ? "border-slate-200 border-b-white bg-white text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Semana {letraSemana(s)}
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                {duracion(totalDe(semanas[s - 1]))}
              </span>
              {s === actualCiclo && (
                <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700">
                  actual
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Las semanas: todas en el formulario, solo una visible */}
      {semanas.slice(0, ciclo).map((sem, i) => {
        const s = i + 1;
        return (
          <div key={s} hidden={s !== pestana} className="overflow-x-auto">
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
                {sem.map((f) => {
                  const error = f.trabaja ? validarDia(f) : null;
                  const n = f.dia_semana;
                  return (
                    <tr key={n} className={f.trabaja ? "" : "opacity-50"}>
                      <td className="py-2 pr-3">
                        <label className="flex items-center gap-2 font-medium">
                          <input
                            type="checkbox"
                            name={`trabaja_${s}_${n}`}
                            checked={f.trabaja}
                            onChange={(e) => cambiar(s, n, { trabaja: e.target.checked })}
                            className="size-4 accent-sky-600"
                          />
                          {DIAS[n - 1].nombre}
                        </label>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="time"
                          name={`entrada_${s}_${n}`}
                          value={f.hora_entrada}
                          disabled={!f.trabaja}
                          onChange={(e) => cambiar(s, n, { hora_entrada: e.target.value })}
                          className={campo}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="time"
                          name={`salida_${s}_${n}`}
                          value={f.hora_salida}
                          disabled={!f.trabaja}
                          onChange={(e) => cambiar(s, n, { hora_salida: e.target.value })}
                          className={campo}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          name={`tolerancia_${s}_${n}`}
                          min={0}
                          max={60}
                          value={f.tolerancia_minutos}
                          disabled={!f.trabaja}
                          onChange={(e) => cambiar(s, n, { tolerancia_minutos: Number(e.target.value) })}
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
                    Total {ciclo > 1 ? `Semana ${letraSemana(s)}` : "semanal"}
                  </td>
                  <td className="py-3 pl-2 text-right tabular-nums">{duracion(totalDe(sem))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}

      {excede && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Supera las {JORNADA_MAX_SEMANAL_H} horas semanales. Ojo: este total incluye la colación,
          que no cuenta como jornada. Revisa si corresponde o si parte son horas extra.
        </p>
      )}

      <MensajeAccion estado={estado} />

      <div className="flex flex-wrap gap-2">
        <BotonEnviar className={botonPrimario}>
          <Save className="size-4" aria-hidden /> Guardar horario
        </BotonEnviar>
        <button type="button" onClick={copiarLunes} className={botonSecundario}>
          <CopyCheck className="size-4" aria-hidden /> Copiar lunes a mar–vie
        </button>
        {ciclo > 1 && pestana > 1 && (
          <button type="button" onClick={copiarDeA} className={botonSecundario}>
            <Copy className="size-4" aria-hidden /> Copiar días de la Semana A
          </button>
        )}
      </div>
    </form>
  );
}
