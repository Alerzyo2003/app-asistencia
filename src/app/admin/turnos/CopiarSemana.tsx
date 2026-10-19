"use client";

import { useActionState } from "react";
import { Copy } from "lucide-react";

import { copiarSemanaAnterior } from "./actions";
import type { EstadoAccion } from "../personal/actions";
import { BotonEnviar, MensajeAccion } from "../ui";
import { botonSecundario } from "../estilos";

export function CopiarSemana({ lunes }: { lunes: string }) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(copiarSemanaAnterior, null);

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        const ok = confirm(
          "Se reemplazarán los turnos de esta semana por los de la semana anterior, para todo el equipo. ¿Continuar?",
        );
        if (!ok) e.preventDefault();
      }}
      className="flex flex-col items-end gap-2"
    >
      <input type="hidden" name="lunes" value={lunes} />
      <BotonEnviar className={botonSecundario}>
        <Copy className="size-4" aria-hidden /> Copiar semana anterior
      </BotonEnviar>
      <MensajeAccion estado={estado} />
    </form>
  );
}
