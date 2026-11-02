/**
 * Layout del panel de administración.
 * requerirAdmin() corta el acceso a cualquiera que no sea admin activo,
 * para TODAS las páginas bajo /admin.
 *
 * En el teléfono las pestañas van abajo, al alcance del pulgar (ver NavAdmin).
 */
import Image from "next/image";
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
      <header className="pt-seguro z-20 bg-noche-900 text-white md:sticky md:top-0">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
          <div className="flex items-center gap-6">
            <p className="flex items-center gap-2.5 font-titulo text-lg font-medium">
              <Image src="/simbolo-dignidad.png" alt="" width={444} height={341} className="h-8 w-auto" />
              Asistencia
            </p>
            {/* useSearchParams necesita un límite de Suspense */}
            <Suspense fallback={null}>
              <NavAdmin />
            </Suspense>
          </div>
          <div className="flex items-center gap-2 text-sm text-noche-100">
            <span className="hidden sm:inline">{perfil.nombre}</span>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="-mr-2 flex min-h-11 items-center gap-1.5 rounded-xl px-3 hover:bg-white/10 md:mr-0"
              >
                <LogOut className="size-4" aria-hidden /> Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:py-6">
        {children}
      </main>
    </div>
  );
}
