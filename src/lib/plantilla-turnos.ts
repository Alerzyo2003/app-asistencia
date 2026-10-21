/**
 * Lectura de turnos escritos a mano en la planilla mensual.
 *
 * Acepta las formas habituales de escribir un turno:
 *   "8:15-16:40" · "8 15 a 16 40" · "815 a 1640" · "11 40 a 2000"
 *   "11:40 a 20.00" · "13 a 18" · "10.40 - 19"
 * y palabras para días sin trabajo: libre, feriado, descanso, vacaciones,
 * licencia, permiso. "base" o vacío = usar el horario base (sin cambio).
 */

export type ValorTurno =
  | { tipo: "tramo"; entrada: string; salida: string } // "HH:MM"
  | { tipo: "libre"; motivo: string } // feriado, libre…
  | { tipo: "base" } // celda vacía o "base": no se toca
  | { tipo: "error"; texto: string };

const PALABRAS_LIBRE = ["libre", "feriado", "descanso", "vacaciones", "vacacion", "licencia", "permiso", "no trabaja", "x"];

/** Quita tildes y pasa a minúsculas. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Convierte un pedazo de hora escrito a mano a "HH:MM".
 * "8 15" → 08:15 · "815" → 08:15 · "1640" → 16:40 · "20" → 20:00 ·
 * "2000" → 20:00 · "20.00" → 20:00 · "8:15" → 08:15
 */
export function leerHora(texto: string): string | null {
  const t = texto.trim().replace(/['´`’]/g, "").replace(/\s*(hrs?|h)$/i, "");
  let h: number;
  let m: number;

  const conSeparador = t.match(/^(\d{1,2})\s*[:.\s,]\s*(\d{2})$/);
  if (conSeparador) {
    h = Number(conSeparador[1]);
    m = Number(conSeparador[2]);
  } else if (/^\d{1,2}$/.test(t)) {
    h = Number(t);
    m = 0;
  } else if (/^\d{3,4}$/.test(t)) {
    h = Number(t.slice(0, -2));
    m = Number(t.slice(-2));
  } else {
    return null;
  }

  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function leerTurno(valor: unknown): ValorTurno {
  if (valor === null || valor === undefined) return { tipo: "base" };
  const original = String(valor).trim();
  if (!original || original === "-" || original === "—") return { tipo: "base" };

  const t = normalizarTexto(original);
  if (t === "base") return { tipo: "base" };
  const palabra = PALABRAS_LIBRE.find((p) => t === p || t.startsWith(`${p} `));
  if (palabra) return { tipo: "libre", motivo: palabra === "x" ? "libre" : palabra };

  // Separar entrada y salida: " a ", "-", "–", "hasta"
  const partes = t
    .replace(/[.,;]+$/, "") // punto final suelto: "11 40 a 20."
    .split(/(?<=\d)\s*a\s*(?=\d)|\s*[-–—]\s*|\s+hasta\s+|\s+al\s+/)
    .filter(Boolean);
  if (partes.length !== 2) return { tipo: "error", texto: original };

  const entrada = leerHora(partes[0]);
  const salida = leerHora(partes[1]);
  if (!entrada || !salida || salida <= entrada) return { tipo: "error", texto: original };
  return { tipo: "tramo", entrada, salida };
}

/** Texto para escribir un turno en la planilla. */
export function textoTurno(v: { entrada: string; salida: string } | "libre"): string {
  if (v === "libre") return "libre";
  const corto = (h: string) => h.replace(/^0/, "");
  return `${corto(v.entrada)} a ${corto(v.salida)}`;
}

/**
 * Busca a quién corresponde un nombre de la planilla:
 * usuario exacto → primer nombre → usuario que empieza igual.
 * Devuelve el id, o un error si no hay o hay más de uno.
 */
export function resolverPersona<T extends { id: string; usuario: string; nombre: string }>(
  clave: string,
  personas: T[],
): { ok: true; persona: T } | { ok: false; error: string } {
  const k = normalizarTexto(clave).replace(/\s+/g, " ");
  if (!k) return { ok: false, error: "fila sin nombre" };

  const exacto = personas.filter((p) => p.usuario === k);
  if (exacto.length === 1) return { ok: true, persona: exacto[0] };

  const porNombre = personas.filter((p) => {
    const n = normalizarTexto(p.nombre);
    return n === k || n.split(" ")[0] === k;
  });
  if (porNombre.length === 1) return { ok: true, persona: porNombre[0] };
  if (porNombre.length > 1) {
    return { ok: false, error: `"${clave}" coincide con varias personas (${porNombre.map((p) => p.usuario).join(", ")}). Usa el usuario exacto.` };
  }

  const porUsuario = personas.filter((p) => p.usuario.startsWith(k.replace(/\s/g, "")));
  if (porUsuario.length === 1) return { ok: true, persona: porUsuario[0] };
  if (porUsuario.length > 1) {
    return { ok: false, error: `"${clave}" coincide con varias personas (${porUsuario.map((p) => p.usuario).join(", ")}). Usa el usuario exacto.` };
  }
  return { ok: false, error: `No se encontró a "${clave}" en Personal.` };
}
