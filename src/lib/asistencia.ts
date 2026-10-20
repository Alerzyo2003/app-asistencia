/**
 * Tipos y reglas de negocio de las marcaciones (compartido cliente/servidor).
 */

/** Lo que el personal puede marcar hoy. */
export const TIPOS_EVENTO = ["entrada", "salida"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/**
 * Tipos que pueden existir en la base. Las marcas de colación son de la
 * versión anterior: se conservan y se muestran, pero ya no se pueden crear.
 */
export type TipoRegistro = TipoEvento | "inicio_colacion" | "fin_colacion";

export const ETIQUETAS: Record<TipoRegistro, string> = {
  entrada: "Entrada",
  salida: "Salida",
  inicio_colacion: "Inicio colación",
  fin_colacion: "Fin colación",
};

/** Secuencia del día: (nada) → entrada → salida. */
export function siguientesPermitidos(ultimo: TipoRegistro | null): TipoEvento[] {
  if (ultimo === null) return ["entrada"];
  if (ultimo === "salida") return [];
  return ["salida"]; // tras entrada (o una colación antigua) solo queda la salida
}

export function esTipoEvento(valor: unknown): valor is TipoEvento {
  return TIPOS_EVENTO.includes(valor as TipoEvento);
}

/** Fila de la tabla `asistencia` tal como la mostramos en pantalla. */
export type Marcacion = {
  id: number;
  tipo: TipoRegistro;
  marcado_en: string;
  valida: boolean;
  motivo_observacion: string | null;
  distancia_m: number | null;
  foto_path: string | null;
};

/** Comparación con el horario del día (null si no tenía horario). */
export type ResultadoPuntualidad = { aTiempo: boolean; texto: string } | null;

export type ResultadoMarcaje =
  | {
      ok: true;
      valida: boolean;
      mensaje: string;
      marcadoEn: string;
      puntualidad: ResultadoPuntualidad;
    }
  | {
      ok: false;
      mensaje: string;
    };

/** Foto: tamaño máximo aceptado por el servidor (la app la comprime antes). */
export const FOTO_MAX_BYTES = 900 * 1024;

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria indicada. */
export function fechaHoy(zona: string): string {
  // en-CA formatea como 2026-10-19
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
