/**
 * /admin/personal/[id] — Ficha de una persona: datos, horario y acceso.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, ShieldCheck, UserRound } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { requerirAdmin } from "@/lib/auth";
import type { DiaHorario } from "@/lib/horarios";
import { PerfilForm, type DatosPerfil } from "./PerfilForm";
import { HorarioForm } from "./HorarioForm";
import { AccesoForm } from "./AccesoForm";
import { tarjeta } from "../../estilos";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FichaPersonaPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { nuevo, aviso } = await searchParams;
  if (!RE_UUID.test(id)) notFound();

  const yo = await requerirAdmin();
  const supabase = await createClient();

  const [{ data: persona }, { data: horarios }] = await Promise.all([
    supabase
      .from("usuarios")
      .select("id, nombre, usuario, rut, email, cargo, rol, activo")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("horarios")
      .select("dia_semana, hora_entrada, hora_salida, tolerancia_minutos")
      .eq("usuario_id", id)
      .order("dia_semana"),
  ]);

  if (!persona) notFound();

  const esUnoMismo = yo.id === persona.id;
  // Postgres devuelve "08:30:00"; el input type="time" usa "08:30".
  const horarioActual: DiaHorario[] = (horarios ?? []).map((h) => ({
    ...h,
    hora_entrada: h.hora_entrada.slice(0, 5),
    hora_salida: h.hora_salida.slice(0, 5),
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/personal"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" aria-hidden /> Personal
        </Link>
        <h1 className="text-xl font-semibold">
          {persona.nombre}
          {!persona.activo && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 align-middle text-xs font-medium text-slate-600">
              Desactivado
            </span>
          )}
        </h1>
      </div>

      {nuevo && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          Cuenta creada. Ahora asígnale su horario para que el reporte pueda calcular atrasos.
        </p>
      )}
      {aviso === "perfil" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          La cuenta se creó, pero algunos datos del perfil no se guardaron. Revísalos abajo.
        </p>
      )}

      <section className={tarjeta}>
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <CalendarClock className="size-5 text-sky-600" aria-hidden /> Horario base semanal
        </h2>
        <HorarioForm usuarioId={persona.id} actual={horarioActual} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={tarjeta}>
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <UserRound className="size-5 text-sky-600" aria-hidden /> Datos
          </h2>
          <PerfilForm persona={persona as DatosPerfil} esUnoMismo={esUnoMismo} />
        </section>

        <section className={tarjeta}>
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-sky-600" aria-hidden /> Acceso
          </h2>
          <AccesoForm usuarioId={persona.id} activo={persona.activo} esUnoMismo={esUnoMismo} />
        </section>
      </div>
    </div>
  );
}
