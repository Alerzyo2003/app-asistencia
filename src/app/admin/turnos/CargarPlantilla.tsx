"use client";

/**
 * Planilla mensual de turnos:
 *  1. Descargar la plantilla (lunes a sábado, ya rellenada con lo actual).
 *  2. Llenarla en Excel como siempre ("8 15 a 16 40", "feriado"…).
 *  3. Subirla → vista previa con lo que se va a guardar y los errores.
 *  4. Confirmar.
 */

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, TriangleAlert, Upload } from "lucide-react";

import { aplicarPlantilla, previsualizarPlantilla, type VistaPrevia } from "./actions";
import { BotonEnviar } from "../ui";
import { botonPrimario, botonSecundario, campo, etiqueta, tarjeta } from "../estilos";

const fechaCorta = (f: string) => `${f.slice(8, 10)}-${f.slice(5, 7)}`;

export function CargarPlantilla({ lunesActual }: { lunesActual: string }) {
  const router = useRouter();
  const [desde, setDesde] = useState(lunesActual);
  const [semanas, setSemanas] = useState(5);
  const [vista, accionVista] = useActionState<VistaPrevia | null, FormData>(previsualizarPlantilla, null);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  const [aplicadaPara, setAplicadaPara] = useState<VistaPrevia | null>(null);

  const yaAplicada = aplicadaPara === vista;

  function confirmar() {
    if (!vista?.ok) return;
    iniciar(async () => {
      const r = await aplicarPlantilla(JSON.stringify(vista.cambios));
      setResultado(r);
      if (r.ok) {
        setAplicadaPara(vista);
        router.refresh();
      }
    });
  }

  // Resumen por persona para la vista previa
  const resumen =
    vista?.ok &&
    Object.values(
      vista.cambios.reduce<Record<string, { persona: string; dias: number; libres: number }>>((acc, c) => {
        const r = (acc[c.usuarioId] ??= { persona: c.persona, dias: 0, libres: 0 });
        r.dias++;
        if (c.valor === "libre") r.libres++;
        return acc;
      }, {}),
    ).sort((a, b) => a.persona.localeCompare(b.persona, "es"));

  return (
    <section className={`${tarjeta} space-y-5`}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <FileSpreadsheet className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold">Planilla mensual de turnos</h2>
          <p className="text-sm text-slate-600">
            Descarga la planilla, escribe los turnos como siempre (por ejemplo{" "}
            <span className="font-mono">8 15 a 16 40</span>, <span className="font-mono">13 a 18</span>,{" "}
            <span className="font-mono">feriado</span>) y súbela aquí.
          </p>
        </div>
      </div>

      {/* 1. Descargar */}
      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
        <label className="space-y-1">
          <span className={etiqueta}>Desde la semana del</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} />
        </label>
        <label className="space-y-1">
          <span className={etiqueta}>Semanas</span>
          <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))} className={campo}>
            {[1, 2, 3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <a href={`/admin/turnos/plantilla?desde=${desde}&semanas=${semanas}`} className={`${botonSecundario} sm:w-fit`}>
          <Download className="size-4" aria-hidden /> Descargar planilla
        </a>
      </div>

      {/* 2. Subir */}
      <form action={accionVista} className="flex flex-col gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1">
          <span className={etiqueta}>Planilla llena (.xlsx)</span>
          <input
            type="file"
            name="archivo"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            onChange={() => setResultado(null)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </label>
        <BotonEnviar className={botonSecundario}>
          <Upload className="size-4" aria-hidden /> Revisar planilla
        </BotonEnviar>
      </form>

      {/* 3. Vista previa */}
      {vista && !vista.ok && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{vista.mensaje}</p>}

      {vista?.ok && (
        <div className="space-y-4 rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-700">
            Del <strong>{fechaCorta(vista.desde)}</strong> al <strong>{fechaCorta(vista.hasta)}</strong>:{" "}
            <strong>{vista.cambios.length}</strong> días con turno para <strong>{vista.personas}</strong>{" "}
            {vista.personas === 1 ? "persona" : "personas"}.
          </p>

          {resumen && resumen.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {resumen.map((r) => (
                <li key={r.persona} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
                  <span className="font-medium">{r.persona}</span>
                  <span className="text-slate-500">
                    {" "}
                    · {r.dias - r.libres} días de turno{r.libres ? ` · ${r.libres} libre/feriado` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {vista.errores.length > 0 && (
            <div className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <p className="flex items-center gap-1.5 font-semibold">
                <TriangleAlert className="size-4" aria-hidden /> Revisa {vista.errores.length}{" "}
                {vista.errores.length === 1 ? "detalle" : "detalles"} (esas celdas no se cargarán):
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {vista.errores.slice(0, 30).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {resultado ? (
            <p
              className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                resultado.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"
              }`}
            >
              {resultado.ok && <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
              {resultado.mensaje}
            </p>
          ) : null}

          {!yaAplicada && vista.cambios.length > 0 && (
            <button type="button" onClick={confirmar} disabled={guardando} className={botonPrimario}>
              {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Confirmar y guardar turnos
            </button>
          )}
        </div>
      )}
    </section>
  );
}
