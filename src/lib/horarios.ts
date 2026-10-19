/**
 * Horarios semanales (compartido cliente/servidor).
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

export type DiaHorario = {
  dia_semana: number;
  hora_entrada: string; // "HH:MM"
  hora_salida: string; // "HH:MM"
  minutos_colacion: number;
  tolerancia_minutos: number;
};

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Minutos efectivos de un día = (salida − entrada) − colación. */
export function minutosDelDia(d: Pick<DiaHorario, "hora_entrada" | "hora_salida" | "minutos_colacion">): number {
  if (!RE_HORA.test(d.hora_entrada) || !RE_HORA.test(d.hora_salida)) return 0;
  return Math.max(0, aMinutos(d.hora_salida) - aMinutos(d.hora_entrada) - d.minutos_colacion);
}

export function minutosSemana(dias: DiaHorario[]): number {
  return dias.reduce((acc, d) => acc + minutosDelDia(d), 0);
}

/** Devuelve un mensaje de error o null si el día es válido. */
export function validarDia(d: DiaHorario): string | null {
  const nombre = DIAS.find((x) => x.n === d.dia_semana)?.nombre ?? `Día ${d.dia_semana}`;
  if (!RE_HORA.test(d.hora_entrada) || !RE_HORA.test(d.hora_salida)) {
    return `${nombre}: hora inválida.`;
  }
  if (aMinutos(d.hora_salida) <= aMinutos(d.hora_entrada)) {
    return `${nombre}: la salida debe ser después de la entrada.`;
  }
  if (!Number.isInteger(d.minutos_colacion) || d.minutos_colacion < 0 || d.minutos_colacion > 180) {
    return `${nombre}: la colación debe estar entre 0 y 180 minutos.`;
  }
  if (minutosDelDia(d) <= 0) {
    return `${nombre}: la colación es más larga que la jornada.`;
  }
  if (!Number.isInteger(d.tolerancia_minutos) || d.tolerancia_minutos < 0 || d.tolerancia_minutos > 60) {
    return `${nombre}: la tolerancia debe estar entre 0 y 60 minutos.`;
  }
  return null;
}
