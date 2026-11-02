/**
 * /admin/personal/[id] — Ficha de una persona: datos, horario y acceso.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Fingerprint, ShieldCheck, UserRound } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { requerirAdmin } from "@/lib/auth";
import { lunesDe } from "@/lib/horarios";
import { fechaHoy } from "@/lib/asistencia";
import { ZONA_HORARIA } from "@/lib/config";
import { PerfilForm, type DatosPerfil } from "./PerfilForm";
import { HorarioForm, type HorarioCiclo, type HorarioOtraPersona } from "./HorarioForm";
import { AccesoForm } from "./AccesoForm";
import { HuellaForm } from "./HuellaForm";
import { estadoHuella, modoIdentidad } from "@/lib/identidad";
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

  const [{ data: persona }, { data: horarios }, huella, { data: otrasPersonas }] = await Promise.all([
    supabase
      .from("usuarios")
      .select("id, nombre, usuario, rut, email, cargo, rol, activo, ciclo_semanas, ciclo_inicio")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("horarios")
      .select("semana_ciclo, dia_semana, hora_entrada, hora_salida, tolerancia_minutos")
      .eq("usuario_id", id)
      .order("semana_ciclo")
      .order("dia_semana"),
    estadoHuella(id),
    // Otras personas activas con su horario, para "Copiar horario de…"
    supabase
      .from("usuarios")
      .select(
        "id, nombre, ciclo_semanas, ciclo_inicio, horarios(semana_ciclo, dia_semana, hora_entrada, hora_salida, tolerancia_minutos)",
      )
      .eq("activo", true)
      .neq("id", id)
      .order("nombre"),
  ]);

  if (!persona) notFound();

  const esUnoMismo = yo.id === persona.id;
  const hoy = fechaHoy(ZONA_HORARIA);
  // Postgres devuelve "08:30:00"; el input type="time" usa "08:30".
  const recortar = (h: HorarioCiclo): HorarioCiclo => ({
    ...h,
    hora_entrada: h.hora_entrada.slice(0, 5),
    hora_salida: h.hora_salida.slice(0, 5),
  });
  const horarioActual: HorarioCiclo[] = (horarios ?? []).map(recortar);

  // Solo se ofrecen las personas que tienen algún horario cargado
  const otras: HorarioOtraPersona[] = (otrasPersonas ?? [])
    .filter((o) => (o.horarios as HorarioCiclo[]).length > 0)
    .map((o) => ({
      id: o.id,
      nombre: o.nombre,
      cicloSemanas: o.ciclo_semanas ?? 1,
      cicloInicio: o.ciclo_inicio,
      horarios: (o.horarios as HorarioCiclo[]).map(recortar),
    }));

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="space-y-1">
        <Link
          href="/admin/personal"
          className="-ml-1 inline-flex min-h-9 items-center gap-1 px-1 text-sm text-tinta-500 hover:text-tinta-800"
        >
          <ArrowLeft className="size-4" aria-hidden /> Personal
        </Link>
        <h1 className="text-2xl text-noche-900">
          {persona.nombre}
          {!persona.activo && (
            <span className="ml-2 rounded-full bg-tinta-100 px-2 py-0.5 align-middle text-xs font-medium text-tinta-600">
              Desactivado
            </span>
          )}
        </h1>
      </div>

      {nuevo && (
        <p className="rounded-xl bg-verde-50 p-3 text-sm text-verde-800">
          Cuenta creada. Ahora asígnale su horario para que el reporte pueda calcular atrasos.
        </p>
      )}
      {aviso === "perfil" && (
        <p className="rounded-xl bg-oro-50 p-3 text-sm text-oro-800">
          La cuenta se creó, pero algunos datos del perfil no se guardaron. Revísalos abajo.
        </p>
      )}

      <section className={tarjeta}>
        <h2 className="mb-4 flex items-center gap-2 text-lg text-noche-900">
          <CalendarClock className="size-5 text-turquesa-600" aria-hidden /> Horario y turnos
        </h2>
        <HorarioForm
          usuarioId={persona.id}
          actual={horarioActual}
          cicloSemanas={persona.ciclo_semanas ?? 1}
          cicloInicio={persona.ciclo_inicio}
          hoy={hoy}
          lunesActual={lunesDe(hoy)}
          otras={otras}
        />
      </section>

      <section className={tarjeta}>
        <h2 className="mb-4 flex items-center gap-2 text-lg text-noche-900">
          <Fingerprint className="size-5 text-turquesa-600" aria-hidden /> Huella / Face ID para marcar
        </h2>
        <HuellaForm
          usuarioId={persona.id}
          usuario={persona.usuario}
          huella={huella}
          exigida={modoIdentidad() === "exigir"}
        />
      </section>

      <div className="grid gap-5 md:gap-6 lg:grid-cols-2">
        <section className={tarjeta}>
          <h2 className="mb-4 flex items-center gap-2 text-lg text-noche-900">
            <UserRound className="size-5 text-turquesa-600" aria-hidden /> Datos
          </h2>
          <PerfilForm persona={persona as DatosPerfil} esUnoMismo={esUnoMismo} />
        </section>

        <section className={tarjeta}>
          <h2 className="mb-4 flex items-center gap-2 text-lg text-noche-900">
            <ShieldCheck className="size-5 text-turquesa-600" aria-hidden /> Acceso
          </h2>
          <AccesoForm usuarioId={persona.id} activo={persona.activo} esUnoMismo={esUnoMismo} />
        </section>
      </div>
    </div>
  );
}
