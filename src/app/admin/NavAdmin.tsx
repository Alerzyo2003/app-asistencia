"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BarChart3, CalendarDays, ListChecks, Users } from "lucide-react";

const LINKS = [
  { href: "/admin/asistencia", texto: "Registros", corto: "Registros", icono: ListChecks },
  { href: "/admin/reportes", texto: "Reporte de horas", corto: "Horas", icono: BarChart3 },
  { href: "/admin/turnos", texto: "Turnos", corto: "Turnos", icono: CalendarDays, sinFiltros: true },
  { href: "/admin/personal", texto: "Personal", corto: "Personal", icono: Users, sinFiltros: true },
];

/**
 * Pestañas del panel: barra fija abajo en el teléfono, en el encabezado desde
 * md. Conserva los filtros de fecha al cambiar de vista.
 */
export function NavAdmin() {
  const ruta = usePathname();
  const params = useSearchParams();
  const query = params.toString();

  return (
    <nav className="pb-seguro fixed inset-x-0 bottom-0 z-20 flex border-t border-tinta-200 bg-white md:static md:gap-1 md:border-0 md:bg-transparent md:p-0">
      {LINKS.map(({ href, texto, corto, icono: Icono, sinFiltros }) => {
        const activo = ruta.startsWith(href);
        // Los filtros de fecha solo tienen sentido en Registros y Reporte.
        const conQuery =
          query && !sinFiltros && !ruta.startsWith("/admin/personal") && !ruta.startsWith("/admin/turnos");
        return (
          <Link
            key={href}
            href={conQuery ? `${href}?${query}` : href}
            aria-current={activo ? "page" : undefined}
            className={`group flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-xs font-medium transition md:flex-none md:flex-row md:gap-1.5 md:rounded-lg md:px-3 md:py-1.5 md:text-sm ${
              activo
                ? "text-noche-900 md:bg-white/15 md:text-white"
                : "text-tinta-500 md:text-noche-100 md:hover:bg-white/10"
            }`}
          >
            <span
              className={`flex h-7 w-14 items-center justify-center rounded-full md:contents ${
                activo ? "bg-turquesa-100" : ""
              }`}
            >
              <Icono className="size-5 md:size-4" aria-hidden />
            </span>
            <span className="md:hidden">{corto}</span>
            <span className="hidden md:inline">{texto}</span>
          </Link>
        );
      })}
    </nav>
  );
}
