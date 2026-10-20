"use client";

import { useActionState, useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";

import { crearPersona, type EstadoAccion } from "./actions";
import { BotonEnviar, MensajeAccion } from "../ui";
import { sugerirUsuario } from "@/lib/usuario";
import { botonPrimario, botonSecundario, campo, etiqueta } from "../estilos";

/** Contraseña temporal fácil de dictar: sin 0/O ni 1/l/I. */
function generarContrasena(): string {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  const aleatorio = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  let base = "";
  for (let i = 0; i < 6; i++) base += aleatorio(letras);
  return `${base[0].toUpperCase()}${base.slice(1)}-${aleatorio(numeros)}${aleatorio(numeros)}${aleatorio(numeros)}`;
}

export function NuevaPersonaForm() {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(crearPersona, null);
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  // Mientras no se edite a mano, el usuario se sugiere a partir del nombre.
  const [usuarioEditado, setUsuarioEditado] = useState(false);

  return (
    <form action={accion} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={etiqueta}>Nombre completo *</span>
          <input
            name="nombre"
            required
            minLength={3}
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              if (!usuarioEditado) setUsuario(sugerirUsuario(e.target.value));
            }}
            className={campo}
          />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>RUT</span>
          <input name="rut" placeholder="12.345.678-9" className={campo} />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Usuario para entrar *</span>
          <input
            name="usuario"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9._\-]{3,30}"
            title="Minúsculas, números, punto, guion o guion bajo (sin espacios ni tildes)"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            value={usuario}
            onChange={(e) => {
              setUsuarioEditado(true);
              setUsuario(e.target.value.toLowerCase().replace(/\s/g, ""));
            }}
            className={`${campo} font-mono`}
          />
          <span className="text-xs text-slate-500">Se sugiere con el nombre; puedes cambiarlo.</span>
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Correo (opcional)</span>
          <input name="email" type="email" autoComplete="off" className={campo} />
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Cargo</span>
          <input
            name="cargo"
            placeholder="Dentista, asistente, recepción…"
            list="cargos"
            className={campo}
          />
          <datalist id="cargos">
            <option value="Odontólogo/a" />
            <option value="Asistente dental" />
            <option value="Recepción" />
            <option value="Aseo" />
            <option value="Administración" />
          </datalist>
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Contraseña inicial *</span>
          <div className="flex gap-2">
            <input
              name="password"
              type="text"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${campo} font-mono`}
            />
            <button
              type="button"
              onClick={() => setPassword(generarContrasena())}
              className={botonSecundario}
              title="Generar contraseña"
            >
              <KeyRound className="size-4" aria-hidden />
              <span className="hidden sm:inline">Generar</span>
            </button>
          </div>
          <span className="text-xs text-slate-500">
            Anótala y entrégasela a la persona; no se vuelve a mostrar.
          </span>
        </label>

        <label className="space-y-1">
          <span className={etiqueta}>Rol</span>
          <select name="rol" defaultValue="empleado" className={campo}>
            <option value="empleado">Personal (solo marca asistencia)</option>
            <option value="admin">Administrador (ve todo el panel)</option>
          </select>
        </label>
      </div>

      <MensajeAccion estado={estado} />

      <BotonEnviar className={botonPrimario}>
        <UserPlus className="size-4" aria-hidden /> Crear cuenta
      </BotonEnviar>
    </form>
  );
}
