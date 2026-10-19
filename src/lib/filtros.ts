/**
 * Filtros del panel de administración.
 * Se leen desde la URL (?desde=...&hasta=...&empleado=...&estado=...), así
 * los filtros se pueden compartir como link y el botón "atrás" funciona.
 * Todo valor que llega por URL se valida antes de llegar a la consulta.
 */
import { fechaHoy } from "./asistencia";

export type EstadoFiltro = "todas" | "validas" | "revision";

export type Filtros = {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  empleado: string | null; // uuid
  estado: EstadoFiltro;
};

type ParamsCrudos = Record<string, string | string[] | undefined>;

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Máximo de días por consulta, para no traer años de datos por accidente. */
export const MAX_DIAS_RANGO = 366;

function uno(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function esFechaReal(s: string | undefined): s is string {
  if (!s || !RE_FECHA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function leerFiltros(params: ParamsCrudos, zona: string): Filtros {
  const hoy = fechaHoy(zona);
  const inicioMes = `${hoy.slice(0, 8)}01`;

  let desde = esFechaReal(uno(params.desde)) ? uno(params.desde)! : inicioMes;
  let hasta = esFechaReal(uno(params.hasta)) ? uno(params.hasta)! : hoy;

  // Si vienen al revés, se invierten.
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  // Se limita el rango máximo.
  const minimoDesde = sumarDias(hasta, -MAX_DIAS_RANGO);
  if (desde < minimoDesde) desde = minimoDesde;

  const empleadoCrudo = uno(params.empleado);
  const empleado = empleadoCrudo && RE_UUID.test(empleadoCrudo) ? empleadoCrudo : null;

  const estadoCrudo = uno(params.estado);
  const estado: EstadoFiltro =
    estadoCrudo === "validas" || estadoCrudo === "revision" ? estadoCrudo : "todas";

  return { desde, hasta, empleado, estado };
}

/** Convierte filtros de vuelta a query string (para links y exportación). */
export function filtrosAQuery(f: Filtros, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ desde: f.desde, hasta: f.hasta, ...extra });
  if (f.empleado) p.set("empleado", f.empleado);
  if (f.estado !== "todas") p.set("estado", f.estado);
  return p.toString();
}
