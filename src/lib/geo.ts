/**
 * Geolocalización y geocerca (geofencing).
 *
 * Este módulo es puro (no depende de Next ni de Supabase), así que se puede
 * usar tanto en el servidor como en el navegador y probar fácilmente.
 *
 * IMPORTANTE: la decisión final de si una marcación está "dentro" o "fuera"
 * se toma SIEMPRE en el servidor. El navegador solo envía las coordenadas;
 * si calculáramos la validez en el cliente, cualquiera podría saltársela.
 */

/** Radio medio de la Tierra en metros (WGS-84 aprox.). */
const RADIO_TIERRA_M = 6_371_008.8;

export type Coordenadas = {
  lat: number;
  lng: number;
};

/** Lectura de ubicación tal como la entrega el navegador. */
export type LecturaUbicacion = Coordenadas & {
  /** coords.accuracy: radio de incertidumbre en metros (68 % de confianza). */
  precision: number;
};

export type ConfigGeocerca = {
  centro: Coordenadas;
  /** Radio permitido alrededor de la clínica, en metros. */
  radioM: number;
  /** Si el GPS reporta una incertidumbre mayor a esto, la lectura no sirve. */
  precisionMaximaM: number;
};

export type ResultadoGeocerca = {
  valida: boolean;
  /** Distancia al centro de la clínica en metros (null si no hubo lectura). */
  distanciaM: number | null;
  motivo: string | null;
};

const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/**
 * Distancia en metros entre dos puntos usando la fórmula de Haversine.
 *
 *   a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
 *   d = 2R · asin(√a)
 *
 * Para distancias de cientos de metros el error frente a un cálculo
 * elipsoidal es de centímetros: más que suficiente para una geocerca.
 */
export function distanciaHaversine(a: Coordenadas, b: Coordenadas): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(a.lat)) *
      Math.cos(aRadianes(b.lat)) *
      Math.sin(dLng / 2) ** 2;

  // Math.min evita NaN por errores de redondeo cuando h supera levemente 1.
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Comprueba que una lectura tenga números reales y en rango. */
export function esLecturaValida(l: unknown): l is LecturaUbicacion {
  if (!l || typeof l !== "object") return false;
  const { lat, lng, precision } = l as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    typeof precision === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Number.isFinite(precision) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    precision >= 0
  );
}

/**
 * Evalúa si una lectura está dentro de la geocerca de la clínica.
 *
 * Reglas (en este orden):
 *  1. Sin lectura (permiso denegado, GPS apagado) → observada.
 *  2. Precisión peor que `precisionMaximaM` → observada (no podemos afirmar
 *     dónde está la persona; típico de celulares sin GPS usando solo wifi/antenas).
 *  3. Distancia al centro mayor que `radioM` → observada.
 *
 * Criterio estricto: se compara la distancia del punto informado contra el
 * radio, sin "regalar" el margen de precisión. Si en la práctica hay muchos
 * falsos rechazos, se puede relajar a `distancia - precision <= radio`.
 */
export function evaluarGeocerca(
  lectura: LecturaUbicacion | null,
  config: ConfigGeocerca,
): ResultadoGeocerca {
  if (!lectura || !esLecturaValida(lectura)) {
    return {
      valida: false,
      distanciaM: null,
      motivo: "Sin ubicación (permiso denegado o GPS no disponible)",
    };
  }

  const distanciaM = distanciaHaversine(lectura, config.centro);

  if (lectura.precision > config.precisionMaximaM) {
    return {
      valida: false,
      distanciaM,
      motivo: `Precisión insuficiente (±${Math.round(lectura.precision)} m; máximo ${config.precisionMaximaM} m)`,
    };
  }

  if (distanciaM > config.radioM) {
    return {
      valida: false,
      distanciaM,
      motivo: `Fuera del radio de la clínica (${Math.round(distanciaM)} m; máximo ${config.radioM} m)`,
    };
  }

  return { valida: true, distanciaM, motivo: null };
}
