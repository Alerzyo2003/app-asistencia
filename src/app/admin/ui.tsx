"use client";

/** Piezas de interfaz reutilizables para formularios con Server Actions. */

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { EstadoAccion } from "./personal/actions";

/** Botón que se deshabilita y muestra un spinner mientras el formulario se envía. */
export function BotonEnviar({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Mensaje de resultado de una acción (éxito o error). */
export function MensajeAccion({ estado }: { estado: EstadoAccion }) {
  if (!estado) return null;
  const Icono = estado.ok ? CheckCircle2 : XCircle;
  return (
    <p
      role={estado.ok ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
        estado.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"
      }`}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      {estado.mensaje}
    </p>
  );
}
