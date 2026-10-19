/**
 * /admin/turnos — Planificación semanal.
 *
 * Muestra a todo el equipo activo en una grilla de 7 días. Cada celda parte
 * del horario efectivo (turno de esa fecha o, si no hay, horario base) y se
 * puede cambiar o marcar como libre. Navegación con ?semana=YYYY-MM-DD.
 */
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { ZONA_HORARIA } from "@/lib/config";
import { fechaHoy } from "@/lib/asistencia";
import { DIAS, diaMes, esFecha, fechasSemana, lunesDe, sumarDias } from "@/lib/horarios";
import { FilaSemana, type CeldaDia } from "./FilaSemana";
import { CopiarSemana } from "./CopiarSemana";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export default async function TurnosPage({ searchParams }: Props) {
  const { semana } = await searchParams;
  const hoy = fechaHoy(ZONA_HORARIA);
  const lunes = lunesDe(typeof semana === "string" && esFecha(semana) ? semana : hoy);
  const fechas = fechasSemana(lunes);
  const esEstaSemana = lunes === lunesDe(hoy);

  const supabase = await createClient();
  const [{ data: personas, error: e1 }, { data: horarios, error: e2 }, { data: turnos, error: e3 }] =
    await Promise.all([
      supabase.from("usuarios").select("id, nombre, cargo").eq("activo", true).order("nombre"),
      supabase.from("horarios").select("usuario_id, dia_semana, hora_entrada, hora_salida"),
      supabase
        .from("turnos")
        .select("usuario_id, fecha, libre, hora_entrada, hora_salida")
        .gte("fecha", fechas[0])
        .lte("fecha", fechas[6]),
    ]);

  const error = e1 ?? e2 ?? e3;
  if (error) throw new Error(`No se pudieron cargar los turnos: ${error.message}`);

  // Índices para armar cada celda rápido
  const baseDe = new Map((horarios ?? []).map((h) => [`${h.usuario_id}|${h.dia_semana}`, h]));
  const turnoDe = new Map((turnos ?? []).map((t) => [`${t.usuario_id}|${t.fecha}`, t]));

  const filas = (personas ?? []).map((p) => {
    const celdas: CeldaDia[] = fechas.map((fecha, i) => {
      const b = baseDe.get(`${p.id}|${i + 1}`);
      const t = turnoDe.get(`${p.id}|${fecha}`);
      const base = b ? { entrada: hhmm(b.hora_entrada), salida: hhmm(b.hora_salida) } : null;

      let efectivo: CeldaDia["efectivo"];
      if (t) {
        efectivo = t.libre ? "libre" : { entrada: hhmm(t.hora_entrada), salida: hhmm(t.hora_salida) };
      } else {
        efectivo = base ?? "libre";
      }
      return { fecha, base, efectivo };
    });
    return { ...p, celdas };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarDays className="size-6 text-sky-600" aria-hidden /> Turnos semanales
          </h1>
          <p className="text-sm text-slate-500">
            Ajusta los días que cambian. Lo que no toques usa el horario base de cada persona.
          </p>
        </div>
        <CopiarSemana lunes={lunes} />
      </div>

      {/* Navegación de semanas */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/turnos?semana=${sumarDias(lunes, -7)}`}
          className="rounded-lg p-2 text-slate-600 ring-1 ring-slate-200 hover:bg-white"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <p className="min-w-48 text-center font-medium">
          Semana del {diaMes(fechas[0])} al {diaMes(fechas[6])}
        </p>
        <Link
          href={`/admin/turnos?semana=${sumarDias(lunes, 7)}`}
          className="rounded-lg p-2 text-slate-600 ring-1 ring-slate-200 hover:bg-white"
          aria-label="Semana siguiente"
        >
          <ChevronRight className="size-5" />
        </Link>
        {!esEstaSemana && (
          <Link
            href="/admin/turnos"
            className="rounded-lg px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
          >
            Ir a esta semana
          </Link>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-200">
          No hay personal activo. Créalo en la pestaña Personal.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="sticky left-0 z-[1] bg-slate-50 px-3 py-3 font-semibold uppercase tracking-wide">
                  Persona
                </th>
                {fechas.map((f, i) => (
                  <th
                    key={f}
                    className={`px-1 py-3 text-center ${f === hoy ? "text-sky-700" : ""}`}
                  >
                    <span className="block font-semibold uppercase tracking-wide">
                      {DIAS[i].corto}
                    </span>
                    <span className="tabular-nums">{diaMes(f)}</span>
                  </th>
                ))}
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((p) => (
                <FilaSemana
                  key={`${p.id}-${lunes}`}
                  usuarioId={p.id}
                  nombre={p.nombre}
                  cargo={p.cargo}
                  lunes={lunes}
                  celdas={p.celdas}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-block size-3 rounded bg-violet-100 ring-1 ring-violet-300" />
        Distinto del horario base · cada fila se guarda por separado
      </p>
    </div>
  );
}
