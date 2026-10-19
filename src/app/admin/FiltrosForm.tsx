/**
 * Barra de filtros. Es un <form method="GET"> normal: al enviar, los
 * filtros quedan en la URL y la página (Server Component) vuelve a consultar.
 * No necesita JavaScript en el navegador.
 */
import { Download, Filter } from "lucide-react";

import type { Empleado } from "@/lib/consultas";
import { filtrosAQuery, type Filtros } from "@/lib/filtros";

const claseCampo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";

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
  return (
    <form
      method="GET"
      action={accion}
      className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
    >
      <label className="space-y-1">
        <span className="text-xs font-medium text-slate-600">Desde</span>
        <input type="date" name="desde" defaultValue={filtros.desde} className={claseCampo} />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-slate-600">Hasta</span>
        <input type="date" name="hasta" defaultValue={filtros.hasta} className={claseCampo} />
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-slate-600">Persona</span>
        <select name="empleado" defaultValue={filtros.empleado ?? ""} className={claseCampo}>
          <option value="">Todo el equipo</option>
          {empleados.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
              {e.activo ? "" : " (inactivo)"}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium text-slate-600">Estado</span>
        <select name="estado" defaultValue={filtros.estado} className={claseCampo}>
          <option value="todas">Todas</option>
          <option value="validas">Solo válidas</option>
          <option value="revision">En revisión</option>
        </select>
      </label>

      <div className="col-span-2 flex items-end gap-2 md:col-span-1">
        <button
          type="submit"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 md:flex-none"
        >
          <Filter className="size-4" aria-hidden /> Filtrar
        </button>
        {/* <a> normal (no <Link>): es una descarga, no una navegación */}
        <a
          href={`/admin/exportar?${filtrosAQuery(filtros, { tipo: exportar })}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 md:flex-none"
        >
          <Download className="size-4" aria-hidden /> Excel
        </a>
      </div>
    </form>
  );
}
