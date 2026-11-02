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
import { anchoMovil, botonPrimario, botonSecundario, campo, etiqueta, rotuloMovil } from "../../estilos";
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
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-turquesa-400 bg-turquesa-50/60 p-3 sm:flex-row sm:items-center">
          <label htmlFor="copiar-de" className="flex items-center gap-1.5 text-sm font-medium text-turquesa-900">
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
        <p className="rounded-xl bg-oro-50 p-3 text-sm text-oro-900 ring-1 ring-oro-200">
          Se copió el horario de <strong>{copiadoDe}</strong>. Ajusta lo que necesites y presiona{" "}
          <strong>Guardar horario</strong> (aún no se ha guardado).
        </p>
      )}

      {/* Configuración del ciclo */}
      <div className="grid gap-4 rounded-xl bg-tinta-50 p-4 sm:grid-cols-2">
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
            <option value={2}>Cada 2 semanas (A / B)</option>
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
          <p className="flex items-start gap-2 text-sm text-tinta-700 sm:col-span-2 sm:items-center">
            <CalendarSync className="size-4 shrink-0 text-turquesa-600" aria-hidden />
            <span>
              Esta semana (lunes {diaMes(lunesActual)}) le toca la{" "}
              <strong className="text-noche-900">Semana {letraSemana(actualCiclo)}</strong>. Luego se
              alternan solas.
            </span>
          </p>
        )}
      </div>

      {/* Pestañas de semanas */}
      {ciclo > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-tinta-200" role="tablist">
          {Array.from({ length: ciclo }, (_, i) => i + 1).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={pestana === s}
              onClick={() => setPestana(s)}
              className={`-mb-px min-h-11 rounded-t-lg border px-3 py-2 text-sm font-medium sm:px-4 ${
                pestana === s
                  ? "border-tinta-200 border-b-white bg-white text-turquesa-700"
                  : "border-transparent text-tinta-500 hover:text-tinta-800"
              }`}
            >
              Semana {letraSemana(s)}
              <span className="ml-1.5 text-xs font-normal text-tinta-400">
                {duracion(totalDe(semanas[s - 1]))}
              </span>
              {s === actualCiclo && (
                <span className="ml-1.5 rounded bg-noche-100 px-1.5 py-0.5 text-xs text-noche-700">
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
            <table className="block w-full text-left text-sm md:table md:min-w-[520px]">
              <thead className="hidden text-xs text-tinta-500 md:table-header-group">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Día</th>
                  <th className="px-2 py-2 font-semibold">Entrada</th>
                  <th className="px-2 py-2 font-semibold">Salida</th>
                  <th className="px-2 py-2 font-semibold">Tolerancia (min)</th>
                  <th className="py-2 pl-2 text-right font-semibold">Horas</th>
                </tr>
              </thead>
              <tbody className="block divide-y divide-tinta-100 md:table-row-group">
                {sem.map((f) => {
                  const error = f.trabaja ? validarDia(f) : null;
                  const n = f.dia_semana;
                  // En el teléfono, un día libre es solo una línea
                  const celdaCampo = `${f.trabaja ? "" : "hidden"} min-w-0 md:table-cell md:px-2 md:py-2`;
                  return (
                    <tr
                      key={n}
                      className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem] items-end gap-x-2 gap-y-2 py-2.5 md:table-row ${
                        f.trabaja ? "" : "opacity-50"
                      }`}
                    >
                      <td className="col-span-2 md:py-2 md:pr-3">
                        <label className="flex min-h-7 items-center gap-2.5 font-medium md:min-h-0 md:gap-2">
                          <input
                            type="checkbox"
                            name={`trabaja_${s}_${n}`}
                            checked={f.trabaja}
                            onChange={(e) => cambiar(s, n, { trabaja: e.target.checked })}
                            className="size-5 accent-noche-900 md:size-4"
                          />
                          {DIAS[n - 1].nombre}
                        </label>
                      </td>
                      <td className={celdaCampo}>
                        <span className={rotuloMovil}>Entrada</span>
                        <input
                          type="time"
                          name={`entrada_${s}_${n}`}
                          value={f.hora_entrada}
                          disabled={!f.trabaja}
                          onChange={(e) => cambiar(s, n, { hora_entrada: e.target.value })}
                          className={`${campo} max-md:px-2`}
                          aria-label={`Entrada ${DIAS[n - 1].nombre}`}
                        />
                      </td>
                      <td className={celdaCampo}>
                        <span className={rotuloMovil}>Salida</span>
                        <input
                          type="time"
                          name={`salida_${s}_${n}`}
                          value={f.hora_salida}
                          disabled={!f.trabaja}
                          onChange={(e) => cambiar(s, n, { hora_salida: e.target.value })}
                          className={`${campo} max-md:px-2`}
                          aria-label={`Salida ${DIAS[n - 1].nombre}`}
                        />
                      </td>
                      <td className={celdaCampo}>
                        <span className={rotuloMovil}>Tol. (min)</span>
                        <input
                          type="number"
                          name={`tolerancia_${s}_${n}`}
                          min={0}
                          max={60}
                          value={f.tolerancia_minutos}
                          disabled={!f.trabaja}
                          onChange={(e) => cambiar(s, n, { tolerancia_minutos: Number(e.target.value) })}
                          className={`${campo} max-md:px-2`}
                          aria-label={`Tolerancia ${DIAS[n - 1].nombre}`}
                        />
                      </td>
                      <td className="col-start-3 row-start-1 text-right tabular-nums md:py-2 md:pl-2">
                        {!f.trabaja ? (
                          "Libre"
                        ) : error ? (
                          <span className="text-xs text-carmin-600">Revisar</span>
                        ) : (
                          duracion(minutosDelDia(f))
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="block md:table-footer-group">
                <tr className="flex justify-between border-t border-tinta-200 font-semibold md:table-row">
                  <td colSpan={4} className="py-3 pr-3 text-tinta-600 md:text-right">
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
        <p className="flex items-start gap-2 rounded-xl bg-oro-50 p-3 text-sm text-oro-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Supera las {JORNADA_MAX_SEMANAL_H} horas semanales. Ojo: este total incluye la colación,
          que no cuenta como jornada. Revisa si corresponde o si parte son horas extra.
        </p>
      )}

      <MensajeAccion estado={estado} />

      <div className="flex flex-wrap gap-2">
        <BotonEnviar className={`${botonPrimario} ${anchoMovil}`}>
          <Save className="size-4" aria-hidden /> Guardar horario
        </BotonEnviar>
        <button type="button" onClick={copiarLunes} className={`${botonSecundario} ${anchoMovil}`}>
          <CopyCheck className="size-4" aria-hidden /> Copiar lunes a mar–vie
        </button>
        {ciclo > 1 && pestana > 1 && (
          <button type="button" onClick={copiarDeA} className={`${botonSecundario} ${anchoMovil}`}>
            <Copy className="size-4" aria-hidden /> Copiar días de la Semana A
          </button>
        )}
      </div>
    </form>
  );
}
