"use client";

import Image from "next/image";
import { useActionState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { iniciarSesion, type EstadoLogin } from "./actions";

const inicial: EstadoLogin = { error: null };

const campoLogin =
  "w-full rounded-2xl border border-tinta-300 bg-white px-4 py-3 text-base outline-none focus:border-turquesa-500 focus:ring-2 focus:ring-turquesa-200";

export default function LoginPage() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, inicial);

  return (
    <main className="pt-seguro flex min-h-dvh flex-col bg-noche-900 sm:items-center sm:justify-center sm:gap-8 sm:p-6">
      <div className="flex flex-1 items-center justify-center px-10 py-8 sm:flex-none sm:p-0">
        <Image
          src="/logo-dignidad.png"
          alt="Dignidad, Clínica Odontológica. Que sonreír sea costumbre"
          width={957}
          height={727}
          priority
          className="h-auto max-h-[38dvh] w-full max-w-64 object-contain"
        />
      </div>

      <form
        action={accion}
        className="space-y-4 rounded-t-[2.5rem] bg-white px-6 pt-8 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:w-full sm:max-w-sm sm:rounded-[2.5rem] sm:p-8"
      >
        <h1 className="text-center text-2xl text-noche-900">Control de asistencia</h1>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-tinta-700">Usuario</span>
          <input
            name="usuario"
            type="text"
            placeholder="ej. jorgeopazo"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className={campoLogin}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-tinta-700">Contraseña</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={campoLogin}
          />
        </label>

        {estado.error && (
          <p role="alert" className="rounded-2xl bg-carmin-50 p-3 text-sm text-carmin-700">
            {estado.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pendiente}
          className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-noche-900 py-3 font-semibold text-white transition hover:bg-noche-700 disabled:opacity-60"
        >
          {pendiente ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <LogIn className="size-5" aria-hidden />
          )}
          Ingresar
        </button>
      </form>
    </main>
  );
}
