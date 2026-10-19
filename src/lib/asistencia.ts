/**
 * Tipos y reglas de negocio de las marcaciones (compartido cliente/servidor).
 */

export const TIPOS_EVENTO = [
  "entrada",
  "inicio_colacion",
  "fin_colacion",
  "salida",
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const ETIQUETAS: Record<TipoEvento, string> = {
  entrada: "Entrada",
  inicio_colacion: "Inicio colación",
  fin_colacion: "Fin colación",
  salida: "Salida",
};

/**
 * Secuencia permitida dentro de una jornada:
 *
 *   (nada) → entrada → inicio_colacion → fin_colacion → salida
 *                   ↘───────────── salida (jornada sin colación)
 */
const SIGUIENTES: Record<TipoEvento | "ninguno", TipoEvento[]> = {
  ninguno: ["entrada"],
  entrada: ["inicio_colacion", "salida"],
  inicio_colacion: ["fin_colacion"],
  fin_colacion: ["salida"],
  salida: [],
};

export function siguientesPermitidos(ultimo: TipoEvento | null): TipoEvento[] {
  return SIGUIENTES[ultimo ?? "ninguno"];
}

export function esTipoEvento(valor: unknown): valor is TipoEvento {
  return TIPOS_EVENTO.includes(valor as TipoEvento);
}

/** Fila de la tabla `asistencia` tal como la mostramos en pantalla. */
export type Marcacion = {
  id: number;
  tipo: TipoEvento;
  marcado_en: string;
  valida: boolean;
  motivo_observacion: string | null;
  distancia_m: number | null;
};

/** Lo que el navegador envía al servidor. Las coordenadas pueden faltar. */
export type SolicitudMarcaje = {
  tipo: TipoEvento;
  ubicacion: { lat: number; lng: number; precision: number } | null;
};

export type ResultadoMarcaje =
  | {
      ok: true;
      valida: boolean;
      mensaje: string;
      marcadoEn: string;
    }
  | {
      ok: false;
      mensaje: string;
    };

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
