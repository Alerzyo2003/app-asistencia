"use client";

import { useActionState } from "react";
import { KeyRound, UserCheck, UserX } from "lucide-react";

import { cambiarActivo, cambiarContrasena, type EstadoAccion } from "../actions";
import { BotonEnviar, MensajeAccion } from "../../ui";
import { botonPeligro, botonPrimario, botonSecundario, campo, etiqueta } from "../../estilos";

export function AccesoForm({
  usuarioId,
  activo,
  esUnoMismo,
}: {
  usuarioId: string;
  activo: boolean;
  esUnoMismo: boolean;
}) {
  const [estadoActivo, accionActivo] = useActionState<EstadoAccion, FormData>(cambiarActivo, null);
  const [estadoClave, accionClave] = useActionState<EstadoAccion, FormData>(cambiarContrasena, null);

  return (
    <div className="space-y-6">
      {/* Cambiar contraseña */}
      <form action={accionClave} className="space-y-3">
        <input type="hidden" name="id" value={usuarioId} />
        <label className="block space-y-1">
          <span className={etiqueta}>Nueva contraseña</span>
          <div className="flex gap-2">
            <input
              name="password"
              type="text"
              minLength={8}
              required
              autoComplete="new-password"
              className={`${campo} font-mono`}
            />
            <BotonEnviar className={botonSecundario}>
              <KeyRound className="size-4" aria-hidden /> Cambiar
            </BotonEnviar>
          </div>
        </label>
        <MensajeAccion estado={estadoClave} />
      </form>

      {/* Activar / desactivar */}
      {!esUnoMismo && (
        <form
          action={accionActivo}
          onSubmit={(e) => {
            if (activo && !confirm("¿Desactivar esta cuenta? No podrá iniciar sesión.")) {
              e.preventDefault();
            }
          }}
          className="space-y-3 border-t border-slate-100 pt-5"
        >
          <input type="hidden" name="id" value={usuarioId} />
          <input type="hidden" name="activar" value={activo ? "0" : "1"} />
          <p className="text-sm text-slate-600">
            {activo
              ? "Desactivar bloquea el inicio de sesión. Sus marcas anteriores se conservan."
              : "La cuenta está desactivada y no puede iniciar sesión."}
          </p>
          <BotonEnviar className={activo ? botonPeligro : botonPrimario}>
            {activo ? (
              <>
                <UserX className="size-4" aria-hidden /> Desactivar cuenta
              </>
            ) : (
              <>
                <UserCheck className="size-4" aria-hidden /> Reactivar cuenta
              </>
            )}
          </BotonEnviar>
          <MensajeAccion estado={estadoActivo} />
        </form>
      )}
    </div>
  );
}
