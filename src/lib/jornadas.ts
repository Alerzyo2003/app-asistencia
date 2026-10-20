/**
 * Arma el detalle día a día de cada persona para el reporte:
 * horario esperado (turno o base), marcas reales, atraso, salida anticipada,
 * ausencias y un "estado" legible.
 *
 * Es lógica pura (sin Supabase ni Excel) para poder probarla fácilmente.
 */

import { DIAS, aMinutos, sumarDias, TOLERANCIA_POR_DEFECTO } from "./horarios";

const ZONA = "America/Santiago";

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export type PersonaReporte = { id: string; nombre: string; rut: string | null; cargo: string | null };

export type JornadaVista = {
  usuario_id: string;
  fecha: string;
  entrada: string | null; // timestamptz ISO
  salida: string | null;
  minutos_trabajados: number | null;
  minutos_atraso: number;
};

export type HorarioBase = {
  usuario_id: string;
  dia_semana: number;
  hora_entrada: string;
  hora_salida: string;
  tolerancia_minutos: number;
};

export type Turno = {
  usuario_id: string;
  fecha: string;
  libre: boolean;
  hora_entrada: string | null;
  hora_salida: string | null;
  tolerancia_minutos: number;
};

export type MarcaObservada = {
  usuario_id: string;
  fecha: string;
  tipo: string;
  motivo_observacion: string | null;
};

// ---------------------------------------------------------------------------
// Salidas
// ---------------------------------------------------------------------------

/** Color/gravedad del día, para pintar la fila. */
export type Nivel = "ok" | "alerta" | "falta" | "neutro";

export type FilaDia = {
  fecha: string; // YYYY-MM-DD
  diaSemana: string; // "Lunes"
  horario: string; // "08:30–17:30" | "Libre" | "Sin horario"
  origenHorario: "turno" | "base" | "libre" | "ninguno";
  entrada: string | null; // "08:42"
  salida: string | null;
  minutosPactados: number | null;
  minutosTrabajados: number | null;
  minutosAtraso: number;
  minutosSalidaAnticipada: number;
  estado: string; // "A tiempo", "Atraso 12 min", "Ausente"…
  nivel: Nivel;
  observaciones: string;
};

export type ResumenPersona = {
  persona: PersonaReporte;
  dias: FilaDia[];
  diasProgramados: number;
  diasTrabajados: number;
  diasATiempo: number;
  atrasos: number;
  minutosAtraso: number;
  salidasAnticipadas: number;
  minutosSalidaAnticipada: number;
  ausencias: number;
  sinSalida: number;
  minutosPactados: number;
  minutosTrabajados: number;
};

// ---------------------------------------------------------------------------

const fmtHora = new Intl.DateTimeFormat("es-CL", {
  timeZone: ZONA,
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
});

const horaLocal = (iso: string | null) => (iso ? fmtHora.format(new Date(iso)) : null);
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

function isoDow(fecha: string): number {
  const d = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

type Esperado =
  | { tipo: "trabajo"; entrada: string; salida: string; tolerancia: number; origen: "turno" | "base" }
  | { tipo: "libre" }
  | { tipo: "ninguno" };

export function calcularReporte(params: {
  personas: PersonaReporte[];
  jornadas: JornadaVista[];
  horarios: HorarioBase[];
  turnos: Turno[];
  observadas: MarcaObservada[];
  desde: string;
  hasta: string;
  hoy: string;
}): ResumenPersona[] {
  const { personas, jornadas, horarios, turnos, observadas, desde, hasta, hoy } = params;

  const jornadaDe = new Map(jornadas.map((j) => [`${j.usuario_id}|${j.fecha}`, j]));
  const baseDe = new Map(horarios.map((h) => [`${h.usuario_id}|${h.dia_semana}`, h]));
  const turnoDe = new Map(turnos.map((t) => [`${t.usuario_id}|${t.fecha}`, t]));
  const obsDe = new Map<string, string[]>();
  for (const o of observadas) {
    const k = `${o.usuario_id}|${o.fecha}`;
    const etiqueta = o.tipo === "entrada" ? "Entrada" : o.tipo === "salida" ? "Salida" : o.tipo;
    obsDe.set(k, [...(obsDe.get(k) ?? []), `${etiqueta} en revisión: ${o.motivo_observacion ?? "sin detalle"}`]);
  }

  function esperado(usuarioId: string, fecha: string): Esperado {
    const t = turnoDe.get(`${usuarioId}|${fecha}`);
    if (t) {
      if (t.libre || !t.hora_entrada || !t.hora_salida) return { tipo: "libre" };
      return {
        tipo: "trabajo",
        entrada: hhmm(t.hora_entrada)!,
        salida: hhmm(t.hora_salida)!,
        tolerancia: t.tolerancia_minutos ?? TOLERANCIA_POR_DEFECTO,
        origen: "turno",
      };
    }
    const b = baseDe.get(`${usuarioId}|${isoDow(fecha)}`);
    if (b) {
      return {
        tipo: "trabajo",
        entrada: hhmm(b.hora_entrada)!,
        salida: hhmm(b.hora_salida)!,
        tolerancia: b.tolerancia_minutos ?? TOLERANCIA_POR_DEFECTO,
        origen: "base",
      };
    }
    return { tipo: "ninguno" };
  }

  // Fechas del período (sin pasar de hoy: el futuro aún no ocurre)
  const fechas: string[] = [];
  const ultimo = hasta < hoy ? hasta : hoy;
  for (let f = desde; f <= ultimo; f = sumarDias(f, 1)) fechas.push(f);

  return personas.map((persona) => {
    const dias: FilaDia[] = [];

    for (const fecha of fechas) {
      const j = jornadaDe.get(`${persona.id}|${fecha}`);
      const e = esperado(persona.id, fecha);

      // Días sin marcas: solo se listan si tocaba trabajar (= ausencia) y ya pasaron
      if (!j && (e.tipo !== "trabajo" || fecha >= hoy)) continue;

      const horario =
        e.tipo === "trabajo" ? `${e.entrada}–${e.salida}` : e.tipo === "libre" ? "Libre" : "Sin horario";
      const minutosPactados = e.tipo === "trabajo" ? aMinutos(e.salida) - aMinutos(e.entrada) : null;

      const fila: FilaDia = {
        fecha,
        diaSemana: DIAS[isoDow(fecha) - 1].nombre,
        horario,
        origenHorario: e.tipo === "trabajo" ? e.origen : e.tipo,
        entrada: horaLocal(j?.entrada ?? null),
        salida: horaLocal(j?.salida ?? null),
        minutosPactados,
        minutosTrabajados: j?.minutos_trabajados ?? null,
        minutosAtraso: j?.minutos_atraso ?? 0,
        minutosSalidaAnticipada: 0,
        estado: "",
        nivel: "ok",
        observaciones: (obsDe.get(`${persona.id}|${fecha}`) ?? []).join(" · "),
      };

      // --- Sin ninguna marca en un día que tocaba trabajar
      if (!j) {
        fila.estado = "Ausente (sin marcas)";
        fila.nivel = "falta";
        dias.push(fila);
        continue;
      }

      // --- Salida anticipada (respeta la misma tolerancia que el atraso)
      if (e.tipo === "trabajo" && fila.salida) {
        const antes = aMinutos(e.salida) - aMinutos(fila.salida);
        if (antes > e.tolerancia) fila.minutosSalidaAnticipada = antes;
      }

      const problemas: string[] = [];
      if (!fila.entrada) problemas.push("Sin entrada");
      if (fila.minutosAtraso > 0) problemas.push(`Atraso ${fila.minutosAtraso} min`);
      if (!fila.salida) problemas.push(fecha === hoy ? "En turno" : "Sin salida");
      if (fila.minutosSalidaAnticipada > 0) {
        problemas.push(`Salió ${fila.minutosSalidaAnticipada} min antes`);
      }

      if (e.tipo === "libre") {
        fila.estado = ["Trabajó en día libre", ...problemas.filter((p) => p !== "En turno")].join(" · ");
        fila.nivel = "neutro";
      } else if (e.tipo === "ninguno") {
        fila.estado = "Sin horario asignado";
        fila.nivel = "neutro";
      } else if (problemas.length === 0) {
        fila.estado = "A tiempo";
        fila.nivel = "ok";
      } else if (problemas.length === 1 && problemas[0] === "En turno") {
        fila.estado = "En turno";
        fila.nivel = "neutro";
      } else {
        fila.estado = problemas.join(" · ");
        fila.nivel = "alerta";
      }

      dias.push(fila);
    }

    // Programados = días con horario ya cerrados (el turno en curso de hoy aún no cuenta)
    const programados = dias.filter((d) => d.minutosPactados !== null && d.estado !== "En turno");
    return {
      persona,
      dias,
      diasProgramados: programados.length,
      diasTrabajados: dias.filter((d) => d.entrada || d.salida).length,
      diasATiempo: dias.filter((d) => d.estado === "A tiempo").length,
      atrasos: dias.filter((d) => d.minutosAtraso > 0).length,
      minutosAtraso: dias.reduce((a, d) => a + d.minutosAtraso, 0),
      salidasAnticipadas: dias.filter((d) => d.minutosSalidaAnticipada > 0).length,
      minutosSalidaAnticipada: dias.reduce((a, d) => a + d.minutosSalidaAnticipada, 0),
      ausencias: dias.filter((d) => d.nivel === "falta").length,
      sinSalida: dias.filter((d) => d.estado.includes("Sin salida")).length,
      minutosPactados: programados.reduce((a, d) => a + (d.minutosPactados ?? 0), 0),
      minutosTrabajados: dias.reduce((a, d) => a + (d.minutosTrabajados ?? 0), 0),
    };
  });
}
