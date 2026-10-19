/**
 * Consultas del panel de administración.
 *
 * Se ejecutan con el cliente DEL USUARIO (no el admin client): las políticas
 * RLS solo dejan ver todo a quien tiene rol admin, así que aunque alguien
 * llegara a esta pantalla sin serlo, solo vería sus propios datos.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TipoRegistro } from "./asistencia";
import type { Filtros } from "./filtros";

/** Supabase limita a 1000 filas por consulta por defecto. */
export const LIMITE_FILAS = 1000;

export type Empleado = { id: string; nombre: string; rut: string | null; activo: boolean };

export type FilaMarca = {
  id: number;
  usuario_id: string;
  tipo: TipoRegistro;
  marcado_en: string;
  fecha: string;
  valida: boolean;
  motivo_observacion: string | null;
  distancia_m: number | null;
  precision_m: number | null;
  latitud: number | null;
  longitud: number | null;
  ip: string | null;
  foto_path: string | null;
  nombre: string;
  rut: string | null;
};

export type FilaJornada = {
  usuario_id: string;
  nombre: string;
  rut: string | null;
  fecha: string;
  entrada: string | null;
  salida: string | null;
  /** De dónde sale el horario esperado: turno de la fecha, horario base, día libre o ninguno */
  origen_horario: "turno" | "base" | "libre" | null;
  hora_entrada_pactada: string | null;
  hora_salida_pactada: string | null;
  minutos_trabajados: number | null;
  minutos_atraso: number;
  marcas_observadas: number;
  fotos: number;
};

export type ResumenEmpleado = {
  usuario_id: string;
  nombre: string;
  rut: string | null;
  dias: number;
  diasIncompletos: number; // sin entrada o sin salida
  minutosTrabajados: number;
  atrasos: number; // cantidad de días con atraso
  minutosAtraso: number;
  marcasObservadas: number;
};

export async function listarEmpleados(supabase: SupabaseClient): Promise<Empleado[]> {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rut, activo")
    .order("nombre");
  if (error) throw new Error(`No se pudo cargar el personal: ${error.message}`);
  return data ?? [];
}

/** Para exportar: tope de seguridad de filas totales (≈ 50 páginas). */
const MAX_FILAS_EXPORTACION = 50_000;

/**
 * Trae todas las páginas de una consulta (de a LIMITE_FILAS) hasta agotarla.
 * `construir` debe devolver una consulta NUEVA en cada llamada.
 */
async function traerTodo<T>(
  construir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let inicio = 0; inicio < MAX_FILAS_EXPORTACION; inicio += LIMITE_FILAS) {
    const { data, error } = await construir(inicio, inicio + LIMITE_FILAS - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < LIMITE_FILAS) break;
  }
  return filas;
}

function consultaMarcas(supabase: SupabaseClient, f: Filtros) {
  let q = supabase
    .from("asistencia")
    .select(
      "id, usuario_id, tipo, marcado_en, fecha, valida, motivo_observacion, distancia_m, precision_m, latitud, longitud, ip, foto_path, usuarios(nombre, rut)",
    )
    .gte("fecha", f.desde)
    .lte("fecha", f.hasta)
    .order("marcado_en", { ascending: false })
    .order("id", { ascending: false }); // orden estable para paginar

  if (f.empleado) q = q.eq("usuario_id", f.empleado);
  if (f.estado === "validas") q = q.eq("valida", true);
  if (f.estado === "revision") q = q.eq("valida", false);
  return q;
}

function aplanarMarcas(data: unknown[]): FilaMarca[] {
  // El join llega anidado como { usuarios: { nombre, rut } }; lo aplanamos.
  return data.map((r) => {
    const { usuarios, ...resto } = r as Record<string, unknown> & {
      usuarios: { nombre: string; rut: string | null } | null;
    };
    return { ...resto, nombre: usuarios?.nombre ?? "—", rut: usuarios?.rut ?? null } as FilaMarca;
  });
}

export async function listarMarcas(
  supabase: SupabaseClient,
  f: Filtros,
): Promise<{ filas: FilaMarca[]; truncado: boolean }> {
  const { data, error } = await consultaMarcas(supabase, f).limit(LIMITE_FILAS);
  if (error) throw new Error(`No se pudieron cargar las marcas: ${error.message}`);
  const filas = aplanarMarcas(data ?? []);
  return { filas, truncado: filas.length === LIMITE_FILAS };
}

/** Todas las marcas del período (para exportar). */
export async function exportarMarcas(supabase: SupabaseClient, f: Filtros): Promise<FilaMarca[]> {
  const data = await traerTodo<unknown>((a, b) => consultaMarcas(supabase, f).range(a, b));
  return aplanarMarcas(data);
}

function consultaJornadas(supabase: SupabaseClient, f: Filtros) {
  let q = supabase
    .from("v_jornadas")
    .select("*")
    .gte("fecha", f.desde)
    .lte("fecha", f.hasta)
    .order("fecha", { ascending: false })
    .order("nombre")
    .order("usuario_id"); // orden estable para paginar

  if (f.empleado) q = q.eq("usuario_id", f.empleado);
  if (f.estado === "validas") q = q.eq("marcas_observadas", 0);
  if (f.estado === "revision") q = q.gt("marcas_observadas", 0);
  return q;
}

/** Todas las jornadas del período (para exportar). */
export async function exportarJornadas(
  supabase: SupabaseClient,
  f: Filtros,
): Promise<FilaJornada[]> {
  return traerTodo<FilaJornada>((a, b) => consultaJornadas(supabase, f).range(a, b));
}

export async function listarJornadas(
  supabase: SupabaseClient,
  f: Filtros,
): Promise<{ filas: FilaJornada[]; truncado: boolean }> {
  const { data, error } = await consultaJornadas(supabase, f).limit(LIMITE_FILAS);
  if (error) throw new Error(`No se pudo cargar el reporte: ${error.message}`);

  const filas = (data ?? []) as FilaJornada[];
  return { filas, truncado: filas.length === LIMITE_FILAS };
}

/** Agrupa las jornadas por persona para el resumen del período. */
export function resumirPorEmpleado(jornadas: FilaJornada[]): ResumenEmpleado[] {
  const mapa = new Map<string, ResumenEmpleado>();

  for (const j of jornadas) {
    const r =
      mapa.get(j.usuario_id) ??
      ({
        usuario_id: j.usuario_id,
        nombre: j.nombre,
        rut: j.rut,
        dias: 0,
        diasIncompletos: 0,
        minutosTrabajados: 0,
        atrasos: 0,
        minutosAtraso: 0,
        marcasObservadas: 0,
      } satisfies ResumenEmpleado);

    r.dias += 1;
    if (j.minutos_trabajados === null) r.diasIncompletos += 1;
    r.minutosTrabajados += j.minutos_trabajados ?? 0;
    if (j.minutos_atraso > 0) {
      r.atrasos += 1;
      r.minutosAtraso += j.minutos_atraso;
    }
    r.marcasObservadas += Number(j.marcas_observadas);

    mapa.set(j.usuario_id, r);
  }

  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
