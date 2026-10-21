"use client";

/**
 * Activación de la huella / Face ID en el celular de la persona.
 *
 * Dos pasos, cada uno con su propio toque en pantalla (Safari exige que la
 * huella se pida directo desde un toque, sin esperar al servidor antes):
 *   1. Ingresa el código que le dio administración → "Continuar".
 *   2. "Registrar mi huella" → el teléfono pide huella/rostro.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, ShieldCheck } from "lucide-react";

import { completarActivacion, prepararActivacion } from "./identidad-actions";

export function ActivarHuella() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [opciones, setOpciones] = useState<PublicKeyCredentialCreationOptionsJSON | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const soportado = typeof window === "undefined" || browserSupportsWebAuthn();

  async function validarCodigo() {
    setError(null);
    setCargando(true);
    try {
      const r = await prepararActivacion(codigo);
      if (r.ok) setOpciones(r.opciones);
      else setError(r.mensaje);
    } catch {
      setError("Sin conexión. Intenta otra vez.");
    } finally {
      setCargando(false);
    }
  }

  async function registrar() {
    if (!opciones) return;
    setError(null);
    setCargando(true);
    try {
      // Debe ser lo primero tras el toque: así el teléfono muestra la huella
      const respuesta = await startRegistration({ optionsJSON: opciones });
      const r = await completarActivacion(codigo, respuesta);
      if (r.ok) {
        setListo(r.mensaje);
        router.refresh();
      } else {
        setError(r.mensaje);
        setOpciones(null);
      }
    } catch (e) {
      const nombre = (e as { name?: string })?.name;
      setError(
        nombre === "NotAllowedError"
          ? "Se canceló o se agotó el tiempo. Toca otra vez para intentarlo."
          : nombre === "InvalidStateError"
            ? "Este celular ya tiene una huella registrada para esta cuenta."
            : "Este celular no pudo registrar la huella. Revisa que tenga bloqueo de pantalla con huella, rostro o PIN.",
      );
    } finally {
      setCargando(false);
    }
  }

  if (listo) {
    return (
      <section className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>{listo}</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-2 ring-violet-300">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <Fingerprint className="size-6" aria-hidden />
        </span>
        <div className="text-sm">
          <p className="font-semibold text-slate-900">Activa tu huella o Face ID</p>
          <p className="text-slate-600">
            Mientras no la actives, tus marcas quedan en revisión. Pide tu código a administración.
          </p>
        </div>
      </div>

      {!soportado ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Este navegador no permite usar la huella. Abre la app en Chrome (Android) o Safari (iPhone).
        </p>
      ) : !opciones ? (
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Código de 6 dígitos"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          />
          <button
            type="button"
            onClick={validarCodigo}
            disabled={codigo.length !== 6 || cargando}
            className="shrink-0 rounded-xl bg-violet-600 px-4 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {cargando ? <Loader2 className="size-5 animate-spin" /> : "Continuar"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={registrar}
          disabled={cargando}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {cargando ? <Loader2 className="size-5 animate-spin" /> : <Fingerprint className="size-5" />}
          Registrar mi huella
        </button>
      )}

      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
