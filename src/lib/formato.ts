/** Formatos de fecha, hora y duración en español de Chile (hora de Santiago). */

const ZONA = "America/Santiago";

const fmtHora = new Intl.DateTimeFormat("es-CL", {
  timeZone: ZONA,
  hour: "2-digit",
  hourCycle: "h23", // formato 24 h (14:50, no 02:50 p. m.)
  minute: "2-digit",
});

const fmtFecha = new Intl.DateTimeFormat("es-CL", {
  timeZone: "UTC", // las fechas "YYYY-MM-DD" se interpretan tal cual
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "2026-10-19T11:42:00Z" → "08:42" */
export function hora(iso: string | null): string {
  return iso ? fmtHora.format(new Date(iso)) : "—";
}

/** "2026-10-19" → "lun, 19-10-2026" */
export function fecha(yyyyMmDd: string): string {
  return fmtFecha.format(new Date(`${yyyyMmDd}T12:00:00Z`));
}

/** "2026-10-19" → "19-10-2026" (para planillas: Excel lo reconoce como fecha) */
export function fechaCorta(yyyyMmDd: string): string {
  const [a, m, d] = yyyyMmDd.split("-");
  return `${d}-${m}-${a}`;
}

/** 473 → "7 h 53 min" */
export function duracion(minutos: number | null): string {
  if (minutos === null) return "—";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** 473 → "7:53" (formato reloj, útil para planillas) */
export function hhmm(minutos: number | null): string {
  if (minutos === null) return "";
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, "0")}`;
}

/** "08:30:00" → "08:30" */
export function horaPactada(t: string | null): string {
  return t ? t.slice(0, 5) : "—";
}
