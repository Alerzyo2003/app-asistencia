/**
 * Excel (.xlsx) con diseño para los reportes de asistencia.
 *
 * Reporte de horas:
 *   1. "Resumen": banda de título, tarjetas con los totales del período y una
 *      tabla por persona con % de puntualidad. Cada nombre enlaza a su hoja.
 *   2. "Incidencias": todos los atrasos, ausencias, salidas anticipadas y
 *      marcas en revisión del período, ordenados por fecha.
 *   3. Una hoja por persona: tarjetas propias y su detalle día a día.
 *
 * Registros: todas las marcas en una hoja con el mismo estilo.
 *
 * Las duraciones se guardan como tiempo de Excel (minutos / 1440) con
 * formato [h]:mm, así se pueden sumar y filtrar dentro de Excel.
 */
import "server-only";

import ExcelJS from "exceljs";

import type { FilaDia, Nivel, ResumenPersona } from "./jornadas";

// ---------------------------------------------------------------------------
// Paleta y formatos
// ---------------------------------------------------------------------------

const C = {
  marca: "FF0C4A6E", // azul profundo (banda de título)
  marcaMedio: "FF075985",
  acento: "FF0284C7",
  acentoClaro: "FFE0F2FE",
  fondoTarjeta: "FFF8FAFC",
  cebra: "FFF8FAFC",
  borde: "FFE2E8F0",
  bordeFuerte: "FF94A3B8",
  texto: "FF0F172A",
  gris: "FF64748B",
  blanco: "FFFFFFFF",
};

const NIVEL: Record<Nivel, { fondo: string; texto: string; icono: string }> = {
  ok: { fondo: "FFDCFCE7", texto: "FF166534", icono: "✓" },
  alerta: { fondo: "FFFEF3C7", texto: "FF92400E", icono: "⚠" },
  falta: { fondo: "FFFEE2E2", texto: "FF991B1B", icono: "✕" },
  neutro: { fondo: "FFF1F5F9", texto: "FF475569", icono: "•" },
};

const FUENTE = "Calibri";

const FMT = {
  fecha: "dd-mm-yyyy",
  duracion: "[h]:mm",
  diferencia: '+[h]:mm;-[h]:mm;"0:00"',
  minutos: '0" min";-0" min";"—"',
  entero: '0;-0;"—"',
  porcentaje: "0%",
};

const lineaFina = { style: "thin" as const, color: { argb: C.borde } };
const BORDE: Partial<ExcelJS.Borders> = {
  top: lineaFina,
  bottom: lineaFina,
  left: lineaFina,
  right: lineaFina,
};

const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const fuente = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({
  name: FUENTE,
  size: 10,
  color: { argb: C.texto },
  ...extra,
});

/** minutos → fracción de día (tiempo de Excel) */
const tiempo = (min: number | null) => (min === null ? null : min / 1440);

/** "2026-10-19" → Date que Excel muestra como 19-10-2026 */
const fechaExcel = (f: string) => {
  const [a, m, d] = f.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

const fechaTexto = (f: string) => f.split("-").reverse().join("-");

const horasTexto = (min: number) => `${Math.floor(min / 60)}:${String(Math.abs(min) % 60).padStart(2, "0")}`;

const pct = (parte: number, total: number) => (total > 0 ? parte / total : null);

/** "08:30–14:00 · Sem. A" / "10:00–19:00 (turno)" */
const textoHorario = (d: FilaDia) =>
  d.origenHorario === "turno"
    ? `${d.horario}  (cambio)`
    : d.semanaCiclo
      ? `${d.horario}  · Sem. ${d.semanaCiclo}`
      : d.horario;

/** Nivel de color para un % de puntualidad. */
const nivelPuntualidad = (p: number | null): Nivel =>
  p === null ? "neutro" : p >= 0.9 ? "ok" : p >= 0.7 ? "alerta" : "falta";

/** Nombre de hoja válido: máx. 31 caracteres, sin []:*?/\' y único. */
function nombreHoja(nombre: string, usados: Set<string>): string {
  const base = nombre.replace(/[[\]:*?/\\']/g, "").trim().slice(0, 28) || "Persona";
  let candidato = base;
  for (let i = 2; usados.has(candidato.toLowerCase()); i++) candidato = `${base.slice(0, 26)} ${i}`;
  usados.add(candidato.toLowerCase());
  return candidato;
}

// ---------------------------------------------------------------------------
// Piezas de diseño
// ---------------------------------------------------------------------------

/**
 * Banda de título a todo el ancho (2 filas azules + separación).
 * `enlace` agrega un link en la esquina derecha de la segunda fila.
 */
function banda(
  ws: ExcelJS.Worksheet,
  columnas: number,
  titulo: string,
  subtitulo: string,
  enlace?: { texto: string; destino: string },
) {
  ws.getRow(1).height = 36;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 10;

  ws.mergeCells(1, 1, 1, columnas);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = fuente({ bold: true, size: 18, color: { argb: C.blanco } });
  t.alignment = { vertical: "middle", indent: 1 };

  const colsSub = enlace ? columnas - 2 : columnas;
  ws.mergeCells(2, 1, 2, colsSub);
  const s = ws.getCell(2, 1);
  s.value = subtitulo;
  s.font = fuente({ size: 10, color: { argb: "FFBAE6FD" } });
  s.alignment = { vertical: "middle", indent: 1 };

  if (enlace) {
    ws.mergeCells(2, colsSub + 1, 2, columnas);
    const l = ws.getCell(2, colsSub + 1);
    l.value = { text: enlace.texto, hyperlink: enlace.destino };
    l.font = fuente({ size: 10, bold: true, underline: true, color: { argb: C.blanco } });
    l.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  }

  for (let col = 1; col <= columnas; col++) {
    ws.getCell(1, col).fill = relleno(C.marca);
    ws.getCell(2, col).fill = relleno(C.marcaMedio);
  }
}

type Tarjeta = { etiqueta: string; valor: string | number; detalle?: string; nivel?: Nivel; numFmt?: string };

/**
 * Fila de "tarjetas" con indicadores grandes. Cada tarjeta ocupa `ancho`
 * columnas y 3 filas (valor, etiqueta, detalle). Devuelve la siguiente fila libre.
 */
function tarjetas(ws: ExcelJS.Worksheet, fila: number, ancho: number, items: Tarjeta[]): number {
  ws.getRow(fila).height = 30;
  ws.getRow(fila + 1).height = 16;
  ws.getRow(fila + 2).height = 15;

  items.forEach((t, i) => {
    const c1 = 1 + i * ancho;
    const c2 = c1 + ancho - 1;
    const color = t.nivel && t.nivel !== "neutro" ? NIVEL[t.nivel].texto : C.marca;

    ws.mergeCells(fila, c1, fila, c2);
    ws.mergeCells(fila + 1, c1, fila + 1, c2);
    ws.mergeCells(fila + 2, c1, fila + 2, c2);

    const valor = ws.getCell(fila, c1);
    valor.value = t.valor;
    if (t.numFmt) valor.numFmt = t.numFmt;
    valor.font = fuente({ bold: true, size: 20, color: { argb: color } });
    valor.alignment = { horizontal: "center", vertical: "bottom" };

    const etiqueta = ws.getCell(fila + 1, c1);
    etiqueta.value = t.etiqueta.toUpperCase();
    etiqueta.font = fuente({ bold: true, size: 8, color: { argb: C.gris } });
    etiqueta.alignment = { horizontal: "center", vertical: "middle" };

    const detalle = ws.getCell(fila + 2, c1);
    detalle.value = t.detalle ?? "";
    detalle.font = fuente({ size: 8, color: { argb: C.gris } });
    detalle.alignment = { horizontal: "center", vertical: "top" };

    // Fondo y borde de la tarjeta (con una franja de color arriba)
    for (let r = fila; r <= fila + 2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cel = ws.getCell(r, c);
        cel.fill = relleno(C.fondoTarjeta);
        cel.border = {
          top: r === fila ? { style: "thick", color: { argb: color } } : undefined,
          bottom: r === fila + 2 ? lineaFina : undefined,
          left: c === c1 ? { style: "medium", color: { argb: C.blanco } } : undefined,
          right: c === c2 ? { style: "medium", color: { argb: C.blanco } } : undefined,
        };
      }
    }
  });

  ws.getRow(fila + 3).height = 12; // separación
  return fila + 4;
}

/** Título pequeño de sección ("DETALLE DÍA A DÍA"). */
function seccion(ws: ExcelJS.Worksheet, fila: number, columnas: number, texto: string): number {
  ws.mergeCells(fila, 1, fila, columnas);
  const c = ws.getCell(fila, 1);
  c.value = texto.toUpperCase();
  c.font = fuente({ bold: true, size: 9, color: { argb: C.acento } });
  c.border = { bottom: { style: "medium", color: { argb: C.acento } } };
  ws.getRow(fila).height = 18;
  return fila + 1;
}

/** Fila de títulos de la tabla. */
function encabezadoTabla(ws: ExcelJS.Worksheet, fila: number, titulos: string[]) {
  const r = ws.getRow(fila);
  r.values = titulos;
  r.height = 32;
  for (let col = 1; col <= titulos.length; col++) {
    const c = r.getCell(col);
    c.font = fuente({ bold: true, size: 9, color: { argb: C.blanco } });
    c.fill = relleno(C.acento);
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { ...BORDE, bottom: { style: "medium", color: { argb: C.marca } } };
  }
}

/** Estilo base de una fila de datos (borde, cebra, alineación). */
function estiloFila(
  fila: ExcelJS.Row,
  columnas: number,
  indice: number,
  alinear: (col: number) => ExcelJS.Alignment["horizontal"],
  envolver: number[] = [],
) {
  fila.height = 20;
  for (let col = 1; col <= columnas; col++) {
    const c = fila.getCell(col);
    c.font = fuente();
    c.border = BORDE;
    c.alignment = { vertical: "middle", horizontal: alinear(col), wrapText: envolver.includes(col) };
    if (indice % 2 === 1) c.fill = relleno(C.cebra);
  }
}

/** Píldora de estado: fondo y texto del nivel, en negrita. */
function pildora(c: ExcelJS.Cell, nivel: Nivel) {
  c.fill = relleno(NIVEL[nivel].fondo);
  c.font = fuente({ bold: true, color: { argb: NIVEL[nivel].texto } });
}

/** Resalta celdas puntuales (atraso, ausencias…). */
function resaltar(fila: ExcelJS.Row, columnas: number[], nivel: Nivel) {
  for (const col of columnas) pildora(fila.getCell(col), nivel);
}

/** Fila de totales. */
function filaTotal(ws: ExcelJS.Worksheet, columnas: number, valores: Record<number, ExcelJS.CellValue>, formatos: Record<number, string>, etiqueta = "TOTAL") {
  const r = ws.addRow([etiqueta]);
  r.height = 22;
  for (const [col, v] of Object.entries(valores)) r.getCell(Number(col)).value = v;
  for (let col = 1; col <= columnas; col++) {
    const c = r.getCell(col);
    c.font = fuente({ bold: true, color: { argb: C.marca } });
    c.fill = relleno(C.acentoClaro);
    c.border = { top: { style: "medium", color: { argb: C.marca } }, bottom: lineaFina };
    c.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center", indent: col === 1 ? 1 : 0 };
    if (formatos[col]) c.numFmt = formatos[col];
  }
  return r;
}

function leyenda(ws: ExcelJS.Worksheet, desdeFila: number, columnas: number) {
  const items: [Nivel, string][] = [
    ["ok", "A tiempo / en orden"],
    ["alerta", "Atraso, salida anticipada o marca faltante"],
    ["falta", "Ausente: tenía horario y no marcó"],
    ["neutro", "Día libre, sin horario o en turno"],
  ];
  const ancho = Math.max(1, Math.floor(columnas / items.length));
  ws.getRow(desdeFila).height = 20;
  items.forEach(([nivel, texto], i) => {
    const c1 = 1 + i * ancho;
    const c2 = i === items.length - 1 ? columnas : c1 + ancho - 1;
    ws.mergeCells(desdeFila, c1, desdeFila, c2);
    const c = ws.getCell(desdeFila, c1);
    c.value = `${NIVEL[nivel].icono}  ${texto}`;
    pildora(c, nivel);
    c.font = fuente({ size: 9, color: { argb: NIVEL[nivel].texto } });
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
}

function terminarHoja(ws: ExcelJS.Worksheet, filaEncabezado: number, congelarColumnas = 0) {
  ws.views = [{ state: "frozen", ySplit: filaEncabezado, xSplit: congelarColumnas, showGridLines: false }];
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.5, header: 0.2, footer: 0.25 },
    printTitlesRow: `${filaEncabezado}:${filaEncabezado}`,
  };
  ws.headerFooter.oddFooter = "&L&8Clínica Odontológica Dignidad · Control de asistencia&R&8Página &P de &N";
}

// ---------------------------------------------------------------------------
// Reporte de horas
// ---------------------------------------------------------------------------

export type MetaReporte = {
  desde: string;
  hasta: string;
  generado: string; // texto ya formateado
};

const periodo = (m: MetaReporte) => `${fechaTexto(m.desde)} al ${fechaTexto(m.hasta)}`;

export async function libroReporte(resumenes: ResumenPersona[], meta: MetaReporte): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de asistencia · Clínica Dignidad";
  wb.created = new Date();

  const usados = new Set<string>(["resumen", "incidencias"]);
  const hojas = resumenes.map((r) => nombreHoja(r.persona.nombre, usados));

  hojaResumen(wb, resumenes, hojas, meta);
  hojaIncidencias(wb, resumenes, hojas, meta);
  resumenes.forEach((r, i) => hojaPersona(wb, hojas[i], r, meta));

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function hojaResumen(wb: ExcelJS.Workbook, resumenes: ResumenPersona[], hojas: string[], meta: MetaReporte) {
  const ws = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: C.marca } } });

  const cols = [
    { t: "Persona", w: 26 },
    { t: "Cargo", w: 17 },
    { t: "Días\nprogramados", w: 12 },
    { t: "Días\ntrabajados", w: 11 },
    { t: "A tiempo", w: 10 },
    { t: "Puntualidad", w: 12 },
    { t: "Atrasos", w: 9 },
    { t: "Tiempo\nde atraso", w: 10 },
    { t: "Salidas\nanticipadas", w: 11 },
    { t: "Ausencias", w: 10 },
    { t: "Sin marca\nde salida", w: 10 },
    { t: "Horas\npactadas", w: 10 },
    { t: "Horas\ntrabajadas", w: 11 },
    { t: "Diferencia", w: 11 },
    { t: "Ver\ndetalle", w: 9 },
  ];
  const N = cols.length; // 15 → 5 tarjetas de 3 columnas
  ws.columns = cols.map((c) => ({ width: c.w }));

  banda(ws, N, "Reporte de asistencia", `Clínica Odontológica Dignidad  ·  Período ${periodo(meta)}  ·  Generado ${meta.generado}`);

  // Totales para las tarjetas
  const tot = resumenes.reduce(
    (a, r) => ({
      programados: a.programados + r.diasProgramados,
      aTiempo: a.aTiempo + r.diasATiempo,
      atrasos: a.atrasos + r.atrasos,
      minAtraso: a.minAtraso + r.minutosAtraso,
      ausencias: a.ausencias + r.ausencias,
      pactados: a.pactados + r.minutosPactados,
      trabajados: a.trabajados + r.minutosTrabajados,
    }),
    { programados: 0, aTiempo: 0, atrasos: 0, minAtraso: 0, ausencias: 0, pactados: 0, trabajados: 0 },
  );
  const puntualidad = pct(tot.aTiempo, tot.programados);

  let fila = tarjetas(ws, 4, 3, [
    { etiqueta: "Personas", valor: resumenes.length, detalle: "en el reporte" },
    {
      etiqueta: "Puntualidad general",
      valor: puntualidad ?? "—",
      numFmt: FMT.porcentaje,
      nivel: nivelPuntualidad(puntualidad),
      detalle: `${tot.aTiempo} de ${tot.programados} días a tiempo`,
    },
    {
      etiqueta: "Atrasos",
      valor: tot.atrasos,
      nivel: tot.atrasos ? "alerta" : "ok",
      detalle: tot.atrasos ? `${horasTexto(tot.minAtraso)} h en total` : "sin atrasos",
    },
    {
      etiqueta: "Ausencias",
      valor: tot.ausencias,
      nivel: tot.ausencias ? "falta" : "ok",
      detalle: "días con horario sin marcas",
    },
    {
      etiqueta: "Horas trabajadas",
      valor: horasTexto(tot.trabajados),
      detalle: `de ${horasTexto(tot.pactados)} h pactadas`,
    },
  ]);

  fila = seccion(ws, fila, N, "Resumen por persona");
  const filaEnc = fila;
  encabezadoTabla(ws, filaEnc, cols.map((c) => c.t));

  const primera = filaEnc + 1;
  resumenes.forEach((r, i) => {
    const p = pct(r.diasATiempo, r.diasProgramados);
    const f = ws.addRow([
      r.persona.nombre,
      r.persona.cargo ?? "",
      r.diasProgramados,
      r.diasTrabajados,
      r.diasATiempo,
      p,
      r.atrasos,
      tiempo(r.minutosAtraso),
      r.salidasAnticipadas,
      r.ausencias,
      r.sinSalida,
      tiempo(r.minutosPactados),
      tiempo(r.minutosTrabajados),
      tiempo(r.minutosTrabajados - r.minutosPactados),
      { text: "Abrir →", hyperlink: `#'${hojas[i]}'!A1` },
    ]);
    estiloFila(f, N, i, (col) => (col <= 2 ? "left" : "center"));
    f.getCell(1).font = fuente({ bold: true });
    f.getCell(1).alignment = { vertical: "middle", indent: 1 };
    f.getCell(2).font = fuente({ color: { argb: C.gris } });
    [3, 4, 5, 7, 9, 10, 11].forEach((c) => (f.getCell(c).numFmt = FMT.entero));
    f.getCell(6).numFmt = FMT.porcentaje;
    [8, 12, 13].forEach((c) => (f.getCell(c).numFmt = FMT.duracion));
    f.getCell(14).numFmt = FMT.diferencia;
    f.getCell(15).font = fuente({ bold: true, underline: true, color: { argb: C.acento } });

    if (p !== null) pildora(f.getCell(6), nivelPuntualidad(p));
    if (r.atrasos > 0) resaltar(f, [7, 8], "alerta");
    if (r.salidasAnticipadas > 0) resaltar(f, [9], "alerta");
    if (r.ausencias > 0) resaltar(f, [10], "falta");
    if (r.sinSalida > 0) resaltar(f, [11], "alerta");
    if (r.minutosTrabajados - r.minutosPactados < 0) {
      f.getCell(14).font = fuente({ color: { argb: NIVEL.falta.texto } });
    }
  });

  if (resumenes.length) {
    const ultima = primera + resumenes.length - 1;
    const suma = (col: number) => {
      const l = ws.getColumn(col).letter;
      return { formula: `SUM(${l}${primera}:${l}${ultima})` };
    };
    filaTotal(
      ws,
      N,
      {
        3: suma(3), 4: suma(4), 5: suma(5),
        6: { formula: `IF(C${ultima + 1}=0,"",E${ultima + 1}/C${ultima + 1})` },
        7: suma(7), 8: suma(8), 9: suma(9), 10: suma(10), 11: suma(11),
        12: suma(12), 13: suma(13), 14: suma(14),
      },
      {
        3: FMT.entero, 4: FMT.entero, 5: FMT.entero, 6: FMT.porcentaje, 7: FMT.entero,
        8: FMT.duracion, 9: FMT.entero, 10: FMT.entero, 11: FMT.entero,
        12: FMT.duracion, 13: FMT.duracion, 14: FMT.diferencia,
      },
    );
  } else {
    ws.mergeCells(primera, 1, primera, N);
    const c = ws.getCell(primera, 1);
    c.value = "No hay personas con horario o marcas en este período.";
    c.font = fuente({ italic: true, color: { argb: C.gris } });
    c.alignment = { horizontal: "center" };
  }

  const notas = ws.rowCount + 2;
  leyenda(ws, notas, N);
  ws.mergeCells(notas + 1, 1, notas + 1, N);
  const nota = ws.getCell(notas + 1, 1);
  nota.value =
    "Puntualidad = días a tiempo ÷ días programados. Horas trabajadas = de entrada a salida. " +
    "El atraso solo cuenta si supera la tolerancia del horario de cada persona.";
  nota.font = fuente({ size: 8, italic: true, color: { argb: C.gris } });
  nota.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(notas + 1).height = 24;

  terminarHoja(ws, filaEnc, 1);
}

function hojaIncidencias(wb: ExcelJS.Workbook, resumenes: ResumenPersona[], hojas: string[], meta: MetaReporte) {
  const ws = wb.addWorksheet("Incidencias", { properties: { tabColor: { argb: "FFD97706" } } });
  const cols = [
    { t: "Fecha", w: 12 },
    { t: "Día", w: 11 },
    { t: "Persona", w: 26 },
    { t: "Incidencia", w: 32 },
    { t: "Horario", w: 22 },
    { t: "Entrada", w: 9 },
    { t: "Salida", w: 9 },
    { t: "Observaciones", w: 50 },
  ];
  const N = cols.length;
  ws.columns = cols.map((c) => ({ width: c.w }));

  const filas = resumenes
    .flatMap((r, i) =>
      r.dias
        .filter((d) => d.nivel === "alerta" || d.nivel === "falta" || d.observaciones)
        .map((d) => ({ d, persona: r.persona.nombre, hoja: hojas[i] })),
    )
    .sort((a, b) => a.d.fecha.localeCompare(b.d.fecha) || a.persona.localeCompare(b.persona, "es"));

  banda(ws, N, "Incidencias del período", `Atrasos, ausencias, salidas anticipadas y marcas en revisión  ·  ${periodo(meta)}`, {
    texto: "← Volver al resumen",
    destino: "#'Resumen'!A1",
  });

  const cuenta = (n: Nivel) => filas.filter((x) => x.d.nivel === n).length;
  let fila = tarjetas(ws, 4, 2, [
    { etiqueta: "Incidencias", valor: filas.length, nivel: filas.length ? "alerta" : "ok" },
    { etiqueta: "Con atraso o salida", valor: cuenta("alerta"), nivel: cuenta("alerta") ? "alerta" : "ok" },
    { etiqueta: "Ausencias", valor: cuenta("falta"), nivel: cuenta("falta") ? "falta" : "ok" },
    {
      etiqueta: "Marcas en revisión",
      valor: filas.filter((x) => x.d.observaciones).length,
      detalle: "ubicación o red",
    },
  ]);

  fila = seccion(ws, fila, N, "Detalle");
  const filaEnc = fila;
  encabezadoTabla(ws, filaEnc, cols.map((c) => c.t));

  if (filas.length === 0) {
    const r = filaEnc + 1;
    ws.mergeCells(r, 1, r, N);
    const c = ws.getCell(r, 1);
    c.value = "✓  Sin incidencias en este período.";
    pildora(c, "ok");
    c.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(r).height = 24;
  }

  filas.forEach(({ d, persona, hoja }, i) => {
    const f = ws.addRow([
      fechaExcel(d.fecha),
      d.diaSemana,
      { text: persona, hyperlink: `#'${hoja}'!A1` },
      `${NIVEL[d.nivel].icono}  ${d.estado}`,
      textoHorario(d),
      d.entrada ?? "—",
      d.salida ?? "—",
      d.observaciones,
    ]);
    estiloFila(f, N, i, (col) => ([3, 4, 8].includes(col) ? "left" : "center"), [8]);
    f.getCell(1).numFmt = FMT.fecha;
    f.getCell(3).font = fuente({ bold: true, underline: true, color: { argb: C.acento } });
    pildora(f.getCell(4), d.nivel === "falta" ? "falta" : d.nivel === "alerta" ? "alerta" : "neutro");
    if (d.observaciones) f.getCell(8).font = fuente({ size: 9, color: { argb: NIVEL.alerta.texto } });
    if (d.observaciones.length > 60) f.height = 30;
  });

  if (filas.length) {
    ws.autoFilter = { from: { row: filaEnc, column: 1 }, to: { row: filaEnc + filas.length, column: N } };
  }
  terminarHoja(ws, filaEnc);
}

function hojaPersona(wb: ExcelJS.Workbook, nombre: string, r: ResumenPersona, meta: MetaReporte) {
  const ws = wb.addWorksheet(nombre);
  const cols = [
    { t: "Fecha", w: 12 },
    { t: "Día", w: 11 },
    { t: "Horario", w: 22 },
    { t: "Entrada", w: 9 },
    { t: "Salida", w: 9 },
    { t: "Atraso", w: 9 },
    { t: "Salió\nantes", w: 9 },
    { t: "Trabajado", w: 10 },
    { t: "Estado", w: 30 },
    { t: "Observaciones", w: 44 },
  ];
  const N = cols.length; // 10 → 5 tarjetas de 2 columnas
  ws.columns = cols.map((c) => ({ width: c.w }));

  const p = r.persona;
  const datos = [p.rut, p.cargo].filter(Boolean).join("  ·  ");
  banda(ws, N, p.nombre, `${datos ? `${datos}  ·  ` : ""}Período ${periodo(meta)}`, {
    texto: "← Volver al resumen",
    destino: "#'Resumen'!A1",
  });

  const puntualidad = pct(r.diasATiempo, r.diasProgramados);
  let fila = tarjetas(ws, 4, 2, [
    {
      etiqueta: "Puntualidad",
      valor: puntualidad ?? "—",
      numFmt: FMT.porcentaje,
      nivel: nivelPuntualidad(puntualidad),
      detalle: `${r.diasATiempo} de ${r.diasProgramados} días a tiempo`,
    },
    {
      etiqueta: "Atrasos",
      valor: r.atrasos,
      nivel: r.atrasos ? "alerta" : "ok",
      detalle: r.atrasos ? `${r.minutosAtraso} min en total` : "sin atrasos",
    },
    {
      etiqueta: "Salidas antes",
      valor: r.salidasAnticipadas,
      nivel: r.salidasAnticipadas ? "alerta" : "ok",
      detalle: r.salidasAnticipadas ? `${r.minutosSalidaAnticipada} min en total` : "—",
    },
    {
      etiqueta: "Ausencias",
      valor: r.ausencias,
      nivel: r.ausencias ? "falta" : "ok",
      detalle: r.sinSalida ? `${r.sinSalida} día(s) sin marca de salida` : "—",
    },
    {
      etiqueta: "Horas trabajadas",
      valor: horasTexto(r.minutosTrabajados),
      detalle: `de ${horasTexto(r.minutosPactados)} h pactadas`,
    },
  ]);

  fila = seccion(ws, fila, N, "Detalle día a día");
  const filaEnc = fila;
  encabezadoTabla(ws, filaEnc, cols.map((c) => c.t));
  const primera = filaEnc + 1;

  if (r.dias.length === 0) {
    ws.mergeCells(primera, 1, primera, N);
    const c = ws.getCell(primera, 1);
    c.value = "Sin registros ni días programados en este período.";
    c.font = fuente({ italic: true, color: { argb: C.gris } });
    c.alignment = { horizontal: "center" };
  }

  r.dias.forEach((d: FilaDia, i) => {
    const f = ws.addRow([
      fechaExcel(d.fecha),
      d.diaSemana,
      textoHorario(d),
      d.entrada ?? "—",
      d.salida ?? "—",
      d.minutosAtraso,
      d.minutosSalidaAnticipada,
      tiempo(d.minutosTrabajados),
      `${NIVEL[d.nivel].icono}  ${d.estado}`,
      d.observaciones,
    ]);
    estiloFila(f, N, i, (col) => (col >= 9 ? "left" : "center"), [10]);
    f.getCell(1).numFmt = FMT.fecha;
    f.getCell(6).numFmt = FMT.minutos;
    f.getCell(7).numFmt = FMT.minutos;
    f.getCell(8).numFmt = FMT.duracion;
    f.getCell(9).alignment = { vertical: "middle", indent: 1 };
    if (d.origenHorario === "turno") f.getCell(3).font = fuente({ color: { argb: "FF6D28D9" } });

    pildora(f.getCell(9), d.nivel);
    if (d.minutosAtraso > 0) resaltar(f, [4, 6], "alerta");
    if (d.minutosSalidaAnticipada > 0) resaltar(f, [5, 7], "alerta");
    if (d.nivel === "falta") resaltar(f, [1, 2], "falta");
    if (d.observaciones) f.getCell(10).font = fuente({ size: 9, color: { argb: NIVEL.alerta.texto } });
    if (d.observaciones.length > 55) f.height = 30;

    // Línea más marcada al empezar cada semana
    if (d.diaSemana === "Lunes" && i > 0) {
      for (let col = 1; col <= N; col++) {
        const c = f.getCell(col);
        c.border = { ...BORDE, top: { style: "medium", color: { argb: C.bordeFuerte } } };
      }
    }
  });

  if (r.dias.length) {
    const ultima = primera + r.dias.length - 1;
    filaTotal(
      ws,
      N,
      {
        6: { formula: `SUM(F${primera}:F${ultima})` },
        7: { formula: `SUM(G${primera}:G${ultima})` },
        8: { formula: `SUM(H${primera}:H${ultima})` },
        9: `Pactadas: ${horasTexto(r.minutosPactados)} h`,
      },
      { 6: FMT.minutos, 7: FMT.minutos, 8: FMT.duracion },
    );
    ws.getCell(ws.rowCount, 9).alignment = { vertical: "middle", indent: 1 };
    ws.autoFilter = { from: { row: filaEnc, column: 1 }, to: { row: ultima, column: N } };
  }

  terminarHoja(ws, filaEnc);
}

// ---------------------------------------------------------------------------
// Registros: todas las marcas en una hoja
// ---------------------------------------------------------------------------

export type MarcaExcel = {
  fecha: string;
  hora: string;
  nombre: string;
  rut: string | null;
  tipo: string;
  valida: boolean;
  motivo: string | null;
  distancia: number | null;
  precision: number | null;
  ip: string | null;
  conFoto: boolean;
  conHuella: boolean;
};

export async function libroMarcas(marcas: MarcaExcel[], meta: MetaReporte): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de asistencia · Clínica Dignidad";
  const ws = wb.addWorksheet("Marcas", { properties: { tabColor: { argb: C.marca } } });

  const cols = [
    { t: "Fecha", w: 12 },
    { t: "Hora", w: 8 },
    { t: "Persona", w: 26 },
    { t: "RUT", w: 13 },
    { t: "Tipo", w: 10 },
    { t: "Estado", w: 15 },
    { t: "Motivo de revisión", w: 46 },
    { t: "Distancia\n(m)", w: 10 },
    { t: "Precisión\nGPS (m)", w: 10 },
    { t: "IP", w: 16 },
    { t: "Huella", w: 8 },
    { t: "Foto", w: 7 },
  ];
  const N = cols.length;
  ws.columns = cols.map((c) => ({ width: c.w }));

  banda(ws, N, "Registro de marcas", `Clínica Odontológica Dignidad  ·  Período ${periodo(meta)}  ·  Generado ${meta.generado}`);

  const enRevision = marcas.filter((m) => !m.valida).length;
  let fila = tarjetas(ws, 4, 2, [
    { etiqueta: "Marcas", valor: marcas.length },
    { etiqueta: "Entradas", valor: marcas.filter((m) => m.tipo === "Entrada").length },
    { etiqueta: "Salidas", valor: marcas.filter((m) => m.tipo === "Salida").length },
    { etiqueta: "Válidas", valor: marcas.length - enRevision, nivel: "ok" },
    { etiqueta: "En revisión", valor: enRevision, nivel: enRevision ? "alerta" : "ok", detalle: "identidad, ubicación o red" },
  ]);

  fila = seccion(ws, fila, N, "Marcas en orden cronológico");
  const filaEnc = fila;
  encabezadoTabla(ws, filaEnc, cols.map((c) => c.t));

  marcas.forEach((m, i) => {
    const f = ws.addRow([
      fechaExcel(m.fecha),
      m.hora,
      m.nombre,
      m.rut ?? "",
      m.tipo,
      m.valida ? "✓  Válida" : "⚠  En revisión",
      m.motivo ?? "",
      m.distancia === null ? null : Math.round(m.distancia),
      m.precision === null ? null : Math.round(m.precision),
      m.ip ?? "",
      m.conHuella ? "✓" : "—",
      m.conFoto ? "📷" : "",
    ]);
    estiloFila(f, N, i, (col) => ([3, 7].includes(col) ? "left" : "center"), [7]);
    f.getCell(1).numFmt = FMT.fecha;
    f.getCell(3).font = fuente({ bold: true });
    f.getCell(3).alignment = { vertical: "middle", indent: 1 };
    pildora(f.getCell(6), m.valida ? "ok" : "alerta");
    if (m.conHuella) f.getCell(11).font = fuente({ bold: true, color: { argb: NIVEL.ok.texto } });
    if (m.motivo) f.getCell(7).font = fuente({ size: 9, color: { argb: NIVEL.alerta.texto } });
    if ((m.motivo ?? "").length > 55) f.height = 30;
    // Separador por día
    if (i > 0 && marcas[i - 1].fecha !== m.fecha) {
      for (let col = 1; col <= N; col++) {
        f.getCell(col).border = { ...BORDE, top: { style: "medium", color: { argb: C.bordeFuerte } } };
      }
    }
  });

  if (marcas.length) {
    ws.autoFilter = { from: { row: filaEnc, column: 1 }, to: { row: filaEnc + marcas.length, column: N } };
  }
  terminarHoja(ws, filaEnc);

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
