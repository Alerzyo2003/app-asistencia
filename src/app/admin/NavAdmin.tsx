"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BarChart3, ListChecks, Users } from "lucide-react";

const LINKS = [
  { href: "/admin/asistencia", texto: "Registros", icono: ListChecks },
  { href: "/admin/reportes", texto: "Reporte de horas", icono: BarChart3 },
  { href: "/admin/personal", texto: "Personal", icono: Users, sinFiltros: true },
];

/** Pestañas del panel. Conserva los filtros de fecha al cambiar de vista. */
export function NavAdmin() {
  const ruta = usePathname();
  const params = useSearchParams();
  const query = params.toString();

  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {LINKS.map(({ href, texto, icono: Icono, sinFiltros }) => {
        const activo = ruta.startsWith(href);
        // Los filtros de fecha solo tienen sentido en Registros y Reporte.
        const conQuery = query && !sinFiltros && !ruta.startsWith("/admin/personal");
        return (
          <Link
            key={href}
            href={conQuery ? `${href}?${query}` : href}
            aria-current={activo ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
              activo ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icono className="size-4" aria-hidden />
            {texto}
          </Link>
        );
      })}
    </nav>
  );
}
