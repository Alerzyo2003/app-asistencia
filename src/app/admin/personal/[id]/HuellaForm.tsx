"use client";

/**
 * Huella / Face ID de una persona (panel de administración):
 * estado, generar código de activación y quitar la huella.
 */

import { useActionState, useEffect, useState } from "react";
import { Fingerprint, KeyRound, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";

import {
  generarCodigoHuella,
  quitarHuellaPersona,
  type EstadoAccion,
  type EstadoCodigo,
} from "../actions";
import { BotonEnviar, MensajeAccion } from "../../ui";
import { botonPeligro, botonPrimario } from "../../estilos";

export type DatosHuella = {
  activa: boolean;
  dispositivo: string | null;
  creadaEn: string | null;
  ultimoUso: string | null;
};

const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        dateStyle: "medium",
        timeStyle: "short",
        hourCycle: "h23",
      }).format(new Date(iso))
    : "—";

/** Cuenta regresiva del código (mm:ss). */
function useCuentaRegresiva(hasta: string | undefined) {
  const [resto, setResto] = useState<number | null>(null);
  useEffect(() => {
    if (!hasta) return;
    const calcular = () => setResto(Math.max(0, Date.parse(hasta) - Date.now()));
    calcular();
    const id = setInterval(calcular, 1000);
    return () => clearInterval(id);
  }, [hasta]);
  if (resto === null) return null;
  const s = Math.floor(resto / 1000);
  return { vencido: resto === 0, texto: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` };
}

export function HuellaForm({
  usuarioId,
  usuario,
  huella,
  exigida,
}: {
  usuarioId: string;
  usuario: string;
  huella: DatosHuella;
  exigida: boolean;
}) {
  const [codigo, accionCodigo] = useActionState<EstadoCodigo, FormData>(generarCodigoHuella, null);
  const [quitar, accionQuitar] = useActionState<EstadoAccion, FormData>(quitarHuellaPersona, null);
  const cuenta = useCuentaRegresiva(codigo?.expiraEn);

  return (
    <div className="space-y-5">
      {/* Estado */}
      {huella.activa ? (
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="space-y-0.5">
            <p className="font-semibold">Huella activa · {huella.dispositivo ?? "Celular"}</p>
            <p>Activada: {fmt(huella.creadaEn)}</p>
            <p>Último uso: {fmt(huella.ultimoUso)}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <ShieldOff className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <p>
            <strong>Sin huella activada.</strong>{" "}
            {exigida
              ? "Sus marcas quedan en revisión hasta que la active."
              : "La verificación por huella está desactivada (IDENTIDAD_MODO)."}
          </p>
        </div>
      )}

      {/* Código de activación */}
      <form action={accionCodigo} className="space-y-3">
        <input type="hidden" name="id" value={usuarioId} />
        <p className="text-sm text-slate-600">
          {huella.activa
            ? "Si cambió de celular, genera un código nuevo: al activarlo en el nuevo teléfono, el anterior deja de servir."
            : "Genera un código y entrégaselo en persona. Lo ingresa en su celular, en la pantalla de marcar."}
        </p>
        <BotonEnviar className={botonPrimario}>
          <KeyRound className="size-4" aria-hidden /> Generar código de activación
        </BotonEnviar>

        {codigo?.ok && codigo.codigo && (
          <div
            className={`rounded-xl p-4 text-center ring-2 ${
              cuenta?.vencido ? "bg-slate-50 ring-slate-200" : "bg-violet-50 ring-violet-300"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-violet-700">
              Código para <span className="font-mono">{usuario}</span>
            </p>
            <p
              className={`my-1 font-mono text-4xl font-bold tracking-[0.3em] ${
                cuenta?.vencido ? "text-slate-300 line-through" : "text-violet-900"
              }`}
            >
              {codigo.codigo}
            </p>
            <p className="text-xs text-slate-600">
              {cuenta?.vencido ? "Vencido: genera otro." : `Vence en ${cuenta?.texto ?? "15:00"} · un solo uso`}
            </p>
          </div>
        )}
        {codigo && !codigo.ok && <MensajeAccion estado={codigo} />}
      </form>

      {/* Quitar huella */}
      {huella.activa && (
        <form
          action={accionQuitar}
          onSubmit={(e) => {
            if (!confirm("¿Quitar la huella? Tendrá que activarla de nuevo con un código.")) e.preventDefault();
          }}
          className="space-y-3 border-t border-slate-100 pt-5"
        >
          <input type="hidden" name="id" value={usuarioId} />
          <BotonEnviar className={botonPeligro}>
            <Trash2 className="size-4" aria-hidden /> Quitar huella (perdió o cambió de celular)
          </BotonEnviar>
          <MensajeAccion estado={quitar} />
        </form>
      )}

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <Fingerprint className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        La huella o el rostro los valida el propio celular: la app no guarda huellas ni fotos de la
        cara, solo una llave digital de ese teléfono.
      </p>
    </div>
  );
}
