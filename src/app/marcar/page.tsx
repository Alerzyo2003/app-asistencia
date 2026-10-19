/**
 * /marcar — Pantalla del empleado (Server Component).
 * Carga el perfil y las marcas de hoy con el cliente del usuario (RLS:
 * solo puede ver las suyas) y se las pasa al panel interactivo.
 */
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ZONA_HORARIA } from "@/lib/config";
import { fechaHoy, type Marcacion } from "@/lib/asistencia";
import { MarcajePanel } from "./MarcajePanel";

export const dynamic = "force-dynamic";

export default async function MarcarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: perfil }, { data: marcas, error }] = await Promise.all([
    supabase.from("usuarios").select("nombre").eq("id", user.id).single(),
    supabase
      .from("asistencia")
      .select("id, tipo, marcado_en, valida, motivo_observacion, distancia_m, foto_path")
      .eq("usuario_id", user.id)
      .eq("fecha", fechaHoy(ZONA_HORARIA))
      .order("marcado_en", { ascending: true }),
  ]);

  if (error) {
    console.error("[marcar] error cargando marcas", error);
  }

  return (
    <main className="min-h-dvh bg-slate-50">
      <MarcajePanel
        nombre={perfil?.nombre ?? user.email ?? ""}
        marcasHoy={(marcas ?? []) as Marcacion[]}
      />
    </main>
  );
}
