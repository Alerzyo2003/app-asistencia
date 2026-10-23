"use client";

import { useActionState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { iniciarSesion, type EstadoLogin } from "./actions";

const inicial: EstadoLogin = { error: null };

export default function LoginPage() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, inicial);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <form
        action={accion}
        className="w-full max-w-sm space-y-5 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200"
      >
        <header className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Control de asistencia</h1>
          <p className="text-sm text-slate-500">Clínica Odontológica Dignidad</p>
        </header>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Usuario</span>
          <input
            name="usuario"
            type="text"
            placeholder="ej. jorgeopazo"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Contraseña</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </label>

        {estado.error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            {estado.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pendiente}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
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
