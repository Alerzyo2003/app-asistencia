/**
 * /admin/personal — Lista del equipo y alta de nuevas cuentas.
 */
import Link from "next/link";
import { ChevronRight, Fingerprint, UserPlus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DIAS,
  letraSemana,
  minutosSemana,
  semanaDelCiclo,
  type DiaHorario,
} from "@/lib/horarios";
import { fechaHoy } from "@/lib/asistencia";
import { ZONA_HORARIA } from "@/lib/config";
import { duracion } from "@/lib/formato";
import { NuevaPersonaForm } from "./NuevaPersonaForm";
import { cabeceraTabla, cajaTabla, cuerpoTabla, tabla, tarjeta } from "../estilos";

type FilaPersona = {
  id: string;
  nombre: string;
  rut: string | null;
  usuario: string;
  email: string;
  cargo: string | null;
  rol: "admin" | "empleado";
  activo: boolean;
  ciclo_semanas: number;
  ciclo_inicio: string | null;
  horarios: (DiaHorario & { semana_ciclo: number })[];
};

export default async function PersonalPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuarios")
    .select(
      "id, nombre, usuario, rut, email, cargo, rol, activo, ciclo_semanas, ciclo_inicio, horarios(semana_ciclo, dia_semana, hora_entrada, hora_salida, tolerancia_minutos)",
    )
    .order("activo", { ascending: false })
    .order("nombre");

  if (error) throw new Error(`No se pudo cargar el personal: ${error.message}`);

  // Quién tiene huella activada (tabla solo accesible con la clave secreta)
  const { data: credenciales } = await createAdminClient()
    .from("credenciales_identidad")
    .select("usuario_id");
  const conHuella = new Set((credenciales ?? []).map((c) => c.usuario_id));
  const personas = (data ?? []) as FilaPersona[];
  const sinHorario = personas.filter((p) => p.activo && p.horarios.length === 0).length;
  const hoy = fechaHoy(ZONA_HORARIA);

  /** Horario de la semana que le toca hoy (A, B…) para calcular las horas. */
  const horariosSemana = (p: FilaPersona) => {
    const s = semanaDelCiclo(hoy, p.ciclo_inicio, p.ciclo_semanas);
    return p.horarios.filter((h) => (h.semana_ciclo ?? 1) === s);
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <h1 className="text-2xl text-noche-900">Personal</h1>

      {sinHorario > 0 && (
        <p className="rounded-xl bg-oro-50 p-3 text-sm text-oro-800">
          {sinHorario === 1 ? "1 persona activa no tiene" : `${sinHorario} personas activas no tienen`}{" "}
          horario asignado. Sin horario no se pueden calcular sus atrasos.
        </p>
      )}

      <div className={cajaTabla}>
        <table className={`${tabla} md:min-w-[720px]`}>
          <thead className={cabeceraTabla}>
            <tr>
              <th className="px-4 py-3 font-semibold">Persona</th>
              <th className="px-4 py-3 font-semibold">Cargo</th>
              <th className="px-4 py-3 font-semibold">Días</th>
              <th className="px-4 py-3 text-right font-semibold">Horas esta semana</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className={cuerpoTabla}>
            {personas.map((p) => {
              const diasTrabajo = new Set(horariosSemana(p).map((h) => h.dia_semana));
              return (
                <tr
                  key={p.id}
                  className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 md:table-row ${
                    p.activo ? "" : "text-tinta-400"
                  }`}
                >
                  <td className="md:px-4 md:py-3">
                    <p className="font-medium">
                      {p.nombre}
                      {p.rol === "admin" && (
                        <span className="ml-2 rounded-full bg-noche-900 px-2 py-0.5 text-xs font-medium text-white">
                          Admin
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-tinta-500">
                      <span className="font-mono text-tinta-700">{p.usuario}</span>
                      {conHuella.has(p.id) ? (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-verde-700" title="Huella activada">
                          <Fingerprint className="inline size-3.5" aria-hidden /> huella
                        </span>
                      ) : (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-oro-700" title="Sin huella activada">
                          <Fingerprint className="inline size-3.5" aria-hidden /> sin huella
                        </span>
                      )}
                      {p.rut ? ` · ${p.rut}` : ""}
                    </p>
                  </td>
                  <td className="col-start-1 text-xs text-tinta-600 md:px-4 md:py-3 md:text-sm md:text-inherit">{p.cargo ?? "—"}</td>
                  <td className="col-start-1 md:px-4 md:py-3">
                    {p.horarios.length === 0 ? (
                      <span className="text-oro-700">Sin horario</span>
                    ) : p.ciclo_semanas > 1 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="rounded bg-noche-100 px-1.5 py-0.5 text-xs font-medium text-noche-700">
                          Rotativo {p.ciclo_semanas} sem.
                        </span>
                        <span className="text-xs text-tinta-500">
                          esta semana: {letraSemana(semanaDelCiclo(hoy, p.ciclo_inicio, p.ciclo_semanas))}
                        </span>
                      </span>
                    ) : (
                      <span className="flex gap-1">
                        {DIAS.map((d) => (
                          <span
                            key={d.n}
                            title={d.nombre}
                            className={`w-6 rounded text-center text-xs ${
                              diasTrabajo.has(d.n)
                                ? "bg-turquesa-100 font-semibold text-turquesa-900"
                                : "text-tinta-300"
                            }`}
                          >
                            {d.corto[0]}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="col-start-2 row-start-3 text-right text-xs tabular-nums text-tinta-600 md:px-4 md:py-3 md:text-sm md:text-inherit">
                    {p.horarios.length
                      ? duracion(
                          minutosSemana(
                            horariosSemana(p).map((h) => ({
                              ...h,
                              hora_entrada: h.hora_entrada.slice(0, 5),
                              hora_salida: h.hora_salida.slice(0, 5),
                            })),
                          ),
                        )
                      : "—"}
                  </td>
                  <td className="col-start-2 row-start-2 text-right text-xs md:px-4 md:py-3 md:text-left md:text-sm">
                    {p.activo ? (
                      <span className="text-verde-700">Activo</span>
                    ) : (
                      <span>Desactivado</span>
                    )}
                  </td>
                  <td className="col-start-2 row-start-1 text-right md:px-4 md:py-3">
                    {/* En el teléfono toda la ficha es tocable */}
                    <Link
                      href={`/admin/personal/${p.id}`}
                      className="inline-flex items-center gap-1 rounded-lg font-medium text-turquesa-700 after:absolute after:inset-0 hover:bg-turquesa-50 md:px-2 md:py-1 md:after:hidden"
                    >
                      Editar <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className={tarjeta}>
        <h2 className="mb-4 flex items-center gap-2 text-lg text-noche-900">
          <UserPlus className="size-5 text-turquesa-600" aria-hidden /> Nueva persona
        </h2>
        <NuevaPersonaForm />
      </section>
    </div>
  );
}
