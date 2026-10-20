/**
 * Horarios y turnos (compartido cliente/servidor).
 *
 * - Horario BASE: lo normal de cada persona por día de la semana.
 * - TURNO: horario de una fecha concreta; manda sobre el base ese día
 *   (o la marca como libre). Sirve para semanas que cambian.
 *
 * dia_semana sigue ISO 8601: 1 = lunes … 7 = domingo (igual que en la base).
 */

export const DIAS = [
  { n: 1, nombre: "Lunes", corto: "Lun" },
  { n: 2, nombre: "Martes", corto: "Mar" },
  { n: 3, nombre: "Miércoles", corto: "Mié" },
  { n: 4, nombre: "Jueves", corto: "Jue" },
  { n: 5, nombre: "Viernes", corto: "Vie" },
  { n: 6, nombre: "Sábado", corto: "Sáb" },
  { n: 7, nombre: "Domingo", corto: "Dom" },
] as const;

/**
 * Jornada ordinaria máxima semanal (Ley 21.561 "40 horas"):
 * 42 h desde abril de 2026; baja a 40 h en abril de 2028.
 * Solo se usa para mostrar un aviso, no bloquea nada.
 */
export const JORNADA_MAX_SEMANAL_H = 42;

export const TOLERANCIA_POR_DEFECTO = 5;

export type DiaHorario = {
  dia_semana: number;
  hora_entrada: string; // "HH:MM"
  hora_salida: string; // "HH:MM"
  tolerancia_minutos: number;
};

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esHora(s: string): boolean {
  return RE_HORA.test(s);
}

export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Minutos de un tramo entrada → salida. */
export function minutosTramo(entrada: string, salida: string): number {
  if (!esHora(entrada) || !esHora(salida)) return 0;
  return Math.max(0, aMinutos(salida) - aMinutos(entrada));
}

export function minutosDelDia(d: Pick<DiaHorario, "hora_entrada" | "hora_salida">): number {
  return minutosTramo(d.hora_entrada, d.hora_salida);
}

export function minutosSemana(dias: Pick<DiaHorario, "hora_entrada" | "hora_salida">[]): number {
  return dias.reduce((acc, d) => acc + minutosDelDia(d), 0);
}

/** Valida un tramo entrada/salida. Devuelve mensaje de error o null. */
export function validarTramo(etiqueta: string, entrada: string, salida: string): string | null {
  if (!esHora(entrada) || !esHora(salida)) return `${etiqueta}: hora inválida.`;
  if (aMinutos(salida) <= aMinutos(entrada)) {
    return `${etiqueta}: la salida debe ser después de la entrada.`;
  }
  return null;
}

/** Valida un día del horario base. */
export function validarDia(d: DiaHorario): string | null {
  const nombre = DIAS.find((x) => x.n === d.dia_semana)?.nombre ?? `Día ${d.dia_semana}`;
  const error = validarTramo(nombre, d.hora_entrada, d.hora_salida);
  if (error) return error;
  if (!Number.isInteger(d.tolerancia_minutos) || d.tolerancia_minutos < 0 || d.tolerancia_minutos > 60) {
    return `${nombre}: la tolerancia debe estar entre 0 y 60 minutos.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Semanas (fechas como "YYYY-MM-DD", sin zona horaria)
// ---------------------------------------------------------------------------

export function esFecha(s: string | undefined | null): s is string {
  if (!s || !RE_FECHA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene `fecha`. */
export function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  const isoDow = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1..7
  return sumarDias(fecha, 1 - isoDow);
}

/** Las 7 fechas (lun→dom) de la semana que empieza en `lunes`. */
export function fechasSemana(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/** "2026-10-19" → "19/10" */
export function diaMes(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

// ---------------------------------------------------------------------------
// Horarios rotativos (Semana A / B / C / D)
// ---------------------------------------------------------------------------

export const MAX_SEMANAS_CICLO = 4;
export const LETRAS_SEMANA = ["A", "B", "C", "D"] as const;

/**
 * Semana del ciclo (1 = A, 2 = B…) que corresponde a `fecha`, dado el lunes
 * en que empieza la Semana A y el largo del ciclo. Misma regla que la función
 * SQL public.semana_del_ciclo().
 */
export function semanaDelCiclo(fecha: string, inicio: string | null, semanas: number): number {
  if (!inicio || semanas <= 1) return 1;
  const ms = Date.parse(`${lunesDe(fecha)}T00:00:00Z`) - Date.parse(`${lunesDe(inicio)}T00:00:00Z`);
  const diff = Math.round(ms / (7 * 86_400_000));
  return (((diff % semanas) + semanas) % semanas) + 1;
}

export const letraSemana = (n: number) => LETRAS_SEMANA[n - 1] ?? String(n);

// ---------------------------------------------------------------------------
// Horario efectivo de una persona en una fecha
// ---------------------------------------------------------------------------

export type FilaHorarioBase = {
  semana_ciclo?: number | null;
  dia_semana: number;
  hora_entrada: string; // "08:30" o "08:30:00"
  hora_salida: string;
  tolerancia_minutos: number;
};

export type FilaTurno = {
  libre: boolean;
  hora_entrada: string | null;
  hora_salida: string | null;
  tolerancia_minutos: number | null;
};

export type HorarioEfectivo =
  | {
      tipo: "trabajo";
      entrada: string; // "HH:MM"
      salida: string;
      tolerancia: number;
      origen: "turno" | "base";
      semana: number; // semana del ciclo (1 = A)
    }
  | { tipo: "libre"; origen: "turno" | "base"; semana: number }
  | { tipo: "ninguno"; semana: number };

const hhmm = (t: string) => t.slice(0, 5);

export function isoDiaSemana(fecha: string): number {
  const d = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * Qué horario le toca a una persona en `fecha`:
 *  1. Si hay un turno puntual para esa fecha, manda el turno.
 *  2. Si no, el horario base de la semana del ciclo que corresponda.
 *  3. Si su base tiene días pero ese día no, es libre; si no tiene nada, "ninguno".
 */
export function horarioEfectivo(params: {
  fecha: string;
  base: FilaHorarioBase[]; // solo los de esa persona
  turno: FilaTurno | null | undefined;
  cicloSemanas: number | null | undefined;
  cicloInicio: string | null | undefined;
}): HorarioEfectivo {
  const { fecha, base, turno } = params;
  const semana = semanaDelCiclo(fecha, params.cicloInicio ?? null, params.cicloSemanas ?? 1);

  if (turno) {
    if (turno.libre || !turno.hora_entrada || !turno.hora_salida) {
      return { tipo: "libre", origen: "turno", semana };
    }
    return {
      tipo: "trabajo",
      entrada: hhmm(turno.hora_entrada),
      salida: hhmm(turno.hora_salida),
      tolerancia: turno.tolerancia_minutos ?? TOLERANCIA_POR_DEFECTO,
      origen: "turno",
      semana,
    };
  }

  const dow = isoDiaSemana(fecha);
  const b = base.find((h) => (h.semana_ciclo ?? 1) === semana && h.dia_semana === dow);
  if (b) {
    return {
      tipo: "trabajo",
      entrada: hhmm(b.hora_entrada),
      salida: hhmm(b.hora_salida),
      tolerancia: b.tolerancia_minutos ?? TOLERANCIA_POR_DEFECTO,
      origen: "base",
      semana,
    };
  }
  return base.length ? { tipo: "libre", origen: "base", semana } : { tipo: "ninguno", semana };
}
