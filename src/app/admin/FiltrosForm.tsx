/**
 * Barra de filtros. Es un <form method="GET"> normal: al enviar, los
 * filtros quedan en la URL y la página (Server Component) vuelve a consultar.
 * No necesita JavaScript en el navegador.
 *
 * En el teléfono se muestra solo un resumen de lo filtrado; la casilla oculta
 * despliega el formulario sin JavaScript. Desde md siempre está abierto.
 */
import { Download, Filter, SlidersHorizontal } from "lucide-react";

import type { Empleado } from "@/lib/consultas";
import { filtrosAQuery, type Filtros } from "@/lib/filtros";
import { fechaCorta } from "@/lib/formato";
import { botonPrimario, botonSecundario, campo, etiqueta } from "./estilos";

const NOMBRE_ESTADO = { todas: null, validas: "Solo válidas", revision: "En revisión" } as const;

export function FiltrosForm({
  accion,
  filtros,
  empleados,
  exportar,
}: {
  /** Ruta de la página actual, ej. "/admin/asistencia" */
  accion: string;
  filtros: Filtros;
  empleados: Empleado[];
  /** Qué exporta el botón CSV de esta vista */
  exportar: "marcas" | "jornadas";
}) {
  const urlExcel = `/admin/exportar?${filtrosAQuery(filtros, { tipo: exportar })}`;
  const persona = empleados.find((e) => e.id === filtros.empleado)?.nombre ?? "Todo el equipo";
  const estado = NOMBRE_ESTADO[filtros.estado];

  return (
    <div>
      <input id="ver-filtros" type="checkbox" className="peer sr-only" aria-label="Mostrar filtros" />

      <div className="flex items-stretch gap-2 rounded-2xl peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-turquesa-500 md:hidden">
        <label
          htmlFor="ver-filtros"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-tinta-200"
        >
          <SlidersHorizontal className="size-5 shrink-0 text-turquesa-600" aria-hidden />
          <span className="min-w-0 text-sm">
            <span className="block font-medium tabular-nums">
              {fechaCorta(filtros.desde)} al {fechaCorta(filtros.hasta)}
            </span>
            <span className="block truncate text-xs text-tinta-500">
              {persona}
              {estado ? `, ${estado.toLowerCase()}` : ""}
            </span>
          </span>
        </label>
        {/* <a> normal (no <Link>): es una descarga, no una navegación */}
        <a href={urlExcel} className={`${botonSecundario} rounded-2xl shadow-sm`}>
          <Download className="size-4" aria-hidden /> Excel
        </a>
      </div>

      <form
        method="GET"
        action={accion}
        className="mt-2 hidden grid-cols-2 gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-tinta-200 peer-checked:grid md:mt-0 md:grid md:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
      >
        <label className="min-w-0 space-y-1">
          <span className={etiqueta}>Desde</span>
          <input type="date" name="desde" defaultValue={filtros.desde} className={campo} />
        </label>

        <label className="min-w-0 space-y-1">
          <span className={etiqueta}>Hasta</span>
          <input type="date" name="hasta" defaultValue={filtros.hasta} className={campo} />
        </label>

        <label className="col-span-2 min-w-0 space-y-1 md:col-span-1">
          <span className={etiqueta}>Persona</span>
          <select name="empleado" defaultValue={filtros.empleado ?? ""} className={campo}>
            <option value="">Todo el equipo</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
                {e.activo ? "" : " (inactivo)"}
              </option>
            ))}
          </select>
        </label>

        <label className="col-span-2 min-w-0 space-y-1 md:col-span-1">
          <span className={etiqueta}>Estado</span>
          <select name="estado" defaultValue={filtros.estado} className={campo}>
            <option value="todas">Todas</option>
            <option value="validas">Solo válidas</option>
            <option value="revision">En revisión</option>
          </select>
        </label>

        <div className="col-span-2 flex items-end gap-2 md:col-span-1">
          <button type="submit" className={`${botonPrimario} flex-1 md:flex-none`}>
            <Filter className="size-4" aria-hidden /> Filtrar
          </button>
          <a href={urlExcel} className={`${botonSecundario} max-md:hidden`}>
            <Download className="size-4" aria-hidden /> Excel
          </a>
        </div>
      </form>
    </div>
  );
}
