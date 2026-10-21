/**
 * /marcar — Pantalla del empleado (Server Component).
 * Carga el perfil y las marcas de hoy con el cliente del usuario (RLS:
 * solo puede ver las suyas) y se las pasa al panel interactivo.
 */
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ZONA_HORARIA } from "@/lib/config";
import { fechaHoy, type Marcacion } from "@/lib/asistencia";
import { horarioDelDia } from "@/lib/horario-servidor";
import { estadoHuella, modoIdentidad } from "@/lib/identidad";
import { letraSemana } from "@/lib/horarios";
import { MarcajePanel } from "./MarcajePanel";

export const dynamic = "force-dynamic";

export default async function MarcarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const hoy = fechaHoy(ZONA_HORARIA);

  const [{ data: perfil }, { data: marcas, error }, horario, huella] = await Promise.all([
    supabase.from("usuarios").select("nombre, ciclo_semanas").eq("id", user.id).single(),
    supabase
      .from("asistencia")
      .select("id, tipo, marcado_en, valida, motivo_observacion, distancia_m, foto_path")
      .eq("usuario_id", user.id)
      .eq("fecha", hoy)
      .order("marcado_en", { ascending: true }),
    // RLS permite leer su propio horario y turnos
    horarioDelDia(supabase, user.id, hoy),
    estadoHuella(user.id),
  ]);

  // Texto del horario de hoy para mostrar en pantalla
  let horarioHoy: string | null = null;
  if (horario?.tipo === "trabajo") {
    const sem = (perfil?.ciclo_semanas ?? 1) > 1 ? ` · Semana ${letraSemana(horario.semana)}` : "";
    horarioHoy = `${horario.entrada} a ${horario.salida}${horario.origen === "turno" ? " · cambio de turno" : sem}`;
  } else if (horario?.tipo === "libre") {
    horarioHoy = "Hoy no tienes turno";
  }

  if (error) {
    console.error("[marcar] error cargando marcas", error);
  }

  return (
    <main className="min-h-dvh bg-slate-50">
      <MarcajePanel
        nombre={perfil?.nombre ?? user.email ?? ""}
        marcasHoy={(marcas ?? []) as Marcacion[]}
        horarioHoy={horarioHoy}
        huellaActiva={huella.activa}
        identidadExigida={modoIdentidad() === "exigir"}
      />
    </main>
  );
}
