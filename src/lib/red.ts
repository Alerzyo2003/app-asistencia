/**
 * Validación de red / IP de la clínica.
 *
 * ¿Por qué en el servidor y por IP pública?
 * - El navegador NO puede conocer su IP local (192.168.x.x) ni el nombre del
 *   wifi: los navegadores lo bloquean por privacidad. Cualquier "chequeo de red"
 *   hecho en el cliente sería falsificable o simplemente imposible.
 * - Lo que sí es confiable es la IP PÚBLICA con la que llega la petición al
 *   servidor. Si el celular está conectado al wifi de la clínica, saldrá a
 *   internet con la IP pública del router de la clínica.
 *
 * Requisito práctico: pedir al proveedor de internet una IP pública FIJA
 * (si es dinámica, cambia cada cierto tiempo y habría que actualizar la lista).
 * Para saberla: desde un equipo conectado al wifi de la clínica, abrir
 * https://api.ipify.org y anotar el número.
 *
 * Modos (variable RED_MODO):
 *  - "estricto"    → si la IP no está en la lista, la marcación queda observada.
 *  - "registrar"   → se guarda la IP pero NO afecta la validez (modo de prueba
 *                     / "simulado": útil las primeras semanas para descubrir
 *                     la IP real y ver cuántos marcan con datos móviles).
 *  - "desactivado" → no se evalúa la red.
 */

import { isIP } from "node:net";

export type ModoRed = "estricto" | "registrar" | "desactivado";

export type ConfigRed = {
  modo: ModoRed;
  /** IPs o rangos CIDR IPv4 permitidos. Ej: ["200.12.34.56", "190.20.0.0/24"] */
  permitidas: string[];
};

export type ResultadoRed = {
  valida: boolean;
  ip: string | null;
  motivo: string | null;
};

/**
 * Obtiene la IP del cliente desde las cabeceras que agrega el proxy/hosting.
 *
 * En Vercel (y la mayoría de plataformas) `x-forwarded-for` lo escribe la
 * propia plataforma y su PRIMER valor es la IP del cliente. Si alojas la app
 * detrás de otro proxy, revisa qué cabecera es confiable en ese entorno: una
 * cabecera que el cliente pueda escribir libremente no sirve como control.
 */
export function obtenerIpCliente(cabeceras: Headers): string | null {
  const candidata =
    cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    cabeceras.get("x-real-ip")?.trim() ||
    null;

  if (!candidata) return null;

  const ip = normalizarIp(candidata);
  return isIP(ip) ? ip : null;
}

/** Convierte "::ffff:200.1.2.3" (IPv4 mapeada en IPv6) en "200.1.2.3". */
function normalizarIp(ip: string): string {
  return ip.toLowerCase().startsWith("::ffff:") && isIP(ip.slice(7)) === 4
    ? ip.slice(7)
    : ip;
}

/** IPv4 → entero sin signo de 32 bits. */
function ipv4AEntero(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octeto) => ((acc << 8) + Number(octeto)) >>> 0, 0);
}

/**
 * ¿La IP coincide con la regla? La regla puede ser una IP exacta (v4 o v6)
 * o un rango CIDR IPv4 ("190.20.0.0/24").
 */
export function ipCoincide(ip: string, regla: string): boolean {
  const [base, bitsTexto] = regla.trim().split("/");

  if (bitsTexto === undefined) {
    return normalizarIp(base) === ip;
  }

  if (isIP(ip) !== 4 || isIP(base) !== 4) return false;

  const bits = Number(bitsTexto);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const mascara = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4AEntero(ip) & mascara) === (ipv4AEntero(base) & mascara);
}

export function evaluarRed(ip: string | null, config: ConfigRed): ResultadoRed {
  if (config.modo === "desactivado") {
    return { valida: true, ip, motivo: null };
  }

  const autorizada =
    ip !== null && config.permitidas.some((regla) => ipCoincide(ip, regla));

  if (autorizada) {
    return { valida: true, ip, motivo: null };
  }

  const motivo = ip
    ? `Red no autorizada (IP ${ip})`
    : "No se pudo determinar la IP de origen";

  // En modo "registrar" se anota el motivo pero no invalida la marcación.
  return config.modo === "estricto"
    ? { valida: false, ip, motivo }
    : { valida: true, ip, motivo: `[solo registro] ${motivo}` };
}
