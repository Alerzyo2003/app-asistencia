"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import { actualizarPersona, type EstadoAccion } from "../actions";
import { BotonEnviar, MensajeAccion } from "../../ui";
import { botonPrimario, campo, etiqueta } from "../../estilos";

export type DatosPerfil = {
  id: string;
  nombre: string;
  rut: string | null;
  email: string;
  cargo: string | null;
  rol: "admin" | "empleado";
};

export function PerfilForm({ persona, esUnoMismo }: { persona: DatosPerfil; esUnoMismo: boolean }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(actualizarPersona, null);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="id" value={persona.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={etiqueta}>Nombre completo *</span>
          <input name="nombre" defaultValue={persona.nombre} required minLength={3} className={campo} />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>RUT</span>
          <input name="rut" defaultValue={persona.rut ?? ""} placeholder="12.345.678-9" className={campo} />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Correo</span>
          <input value={persona.email} disabled className={campo} />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Cargo</span>
          <input name="cargo" defaultValue={persona.cargo ?? ""} className={campo} />
        </label>

        <label className="space-y-1 sm:col-span-2">
          <span className={etiqueta}>Rol</span>
          <select
            name="rol"
            defaultValue={persona.rol}
            disabled={esUnoMismo}
            className={campo}
          >
            <option value="empleado">Personal (solo marca asistencia)</option>
            <option value="admin">Administrador (ve todo el panel)</option>
          </select>
          {/* Un <select> deshabilitado no se envía: mandamos el valor aparte */}
          {esUnoMismo && <input type="hidden" name="rol" value={persona.rol} />}
          {esUnoMismo && (
            <span className="text-xs text-slate-500">No puedes cambiar tu propio rol.</span>
          )}
        </label>
      </div>

      <MensajeAccion estado={estado} />

      <BotonEnviar className={botonPrimario}>
        <Save className="size-4" aria-hidden /> Guardar datos
      </BotonEnviar>
    </form>
  );
}
