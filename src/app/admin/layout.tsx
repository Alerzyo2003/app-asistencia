/**
 * Layout del panel de administración.
 * requerirAdmin() corta el acceso a cualquiera que no sea admin activo,
 * para TODAS las páginas bajo /admin.
 */
import { Suspense, type ReactNode } from "react";
import { LogOut } from "lucide-react";

import { requerirAdmin } from "@/lib/auth";
import { cerrarSesion } from "@/app/login/actions";
import { NavAdmin } from "./NavAdmin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const perfil = await requerirAdmin();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <p className="font-semibold text-slate-900">Asistencia · Dignidad</p>
            {/* useSearchParams necesita un límite de Suspense */}
            <Suspense fallback={null}>
              <NavAdmin />
            </Suspense>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{perfil.nombre}</span>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-slate-100"
              >
                <LogOut className="size-4" aria-hidden /> Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
