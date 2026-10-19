/**
 * Configuración de la clínica (solo servidor).
 *
 * Las coordenadas y la lista de IPs viven en variables de entorno del
 * servidor (sin prefijo NEXT_PUBLIC_), así no viajan al navegador.
 */
import "server-only";

import type { ConfigGeocerca } from "./geo";
import type { ConfigRed, ModoRed } from "./red";

function numeroEnv(nombre: string, porDefecto?: number): number {
  const valor = process.env[nombre];
  if (valor === undefined || valor === "") {
    if (porDefecto !== undefined) return porDefecto;
    throw new Error(`Falta la variable de entorno ${nombre}`);
  }
  const n = Number(valor);
  if (!Number.isFinite(n)) {
    throw new Error(`La variable ${nombre} no es un número válido: "${valor}"`);
  }
  return n;
}

export function obtenerConfigGeocerca(): ConfigGeocerca {
  return {
    centro: {
      lat: numeroEnv("CLINICA_LAT"),
      lng: numeroEnv("CLINICA_LNG"),
    },
    radioM: numeroEnv("GEOCERCA_RADIO_M", 100),
    precisionMaximaM: numeroEnv("GEOCERCA_PRECISION_MAX_M", 50),
  };
}

export function obtenerConfigRed(): ConfigRed {
  const modo = (process.env.RED_MODO ?? "registrar") as ModoRed;
  if (!["estricto", "registrar", "desactivado"].includes(modo)) {
    throw new Error(`RED_MODO inválido: "${modo}"`);
  }
  return {
    modo,
    permitidas: (process.env.RED_IPS_PERMITIDAS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** Zona horaria oficial de la clínica para fechas y reportes. */
export const ZONA_HORARIA = "America/Santiago";
