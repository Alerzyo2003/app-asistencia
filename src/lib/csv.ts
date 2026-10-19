/**
 * Generador de CSV pensado para Excel en español (Chile):
 * - Separador ";" (Excel es-CL usa "," como decimal, así que ";" separa columnas).
 * - Decimales con coma.
 * - BOM UTF-8 al inicio para que Excel muestre bien tildes y ñ.
 * - Protección contra "inyección de fórmulas": un texto que empieza con
 *   = + - @ se antepone con ' para que Excel no lo ejecute como fórmula.
 */

export type Celda = string | number | boolean | null | undefined;

const PELIGROSOS = /^[=+\-@\t\r]/;

function celda(valor: Celda): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? String(valor).replace(".", ",") : "";
  }

  let texto = valor;
  if (PELIGROSOS.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function generarCsv(encabezados: string[], filas: Celda[][]): string {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(celda).join(";"));
  return "﻿" + lineas.join("\r\n");
}
