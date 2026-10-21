"use client";

/**
 * Panel de marcaje para el celular del empleado.
 *
 * - 2 botones grandes: Entrada y Salida. Solo se habilita el que corresponde
 *   (el servidor vuelve a validar igual).
 * - Foto opcional: se toma con la cámara en vivo (no hay acceso a galería)
 *   y se adjunta a la siguiente marca.
 * - Al marcar: pide ubicación precisa → envía todo a la Server Action.
 * - Si la persona no da permiso de ubicación, la marca se envía igual y queda
 *   "en revisión" (la ley no permite bloquearla).
 *
 * Requisito: HTTPS (o http://localhost en desarrollo) para ubicación y cámara.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import {
  CalendarClock,
  Camera,
  CheckCircle2,
  Clock,
  Fingerprint,
  ImageIcon,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Timer,
  TriangleAlert,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import {
  ETIQUETAS,
  siguientesPermitidos,
  type Marcacion,
  type ResultadoMarcaje,
  type TipoEvento,
} from "@/lib/asistencia";
import { registrarMarcaje } from "./actions";
import { cerrarSesion } from "@/app/login/actions";
import { CamaraFoto } from "./CamaraFoto";
import { ActivarHuella } from "./ActivarHuella";
import { prepararVerificacion } from "./identidad-actions";

const ZONA = "America/Santiago";

const BOTONES: { tipo: TipoEvento; icono: LucideIcon; color: string }[] = [
  { tipo: "entrada", icono: LogIn, color: "bg-emerald-600 hover:bg-emerald-700" },
  { tipo: "salida", icono: LogOut, color: "bg-rose-600 hover:bg-rose-700" },
];

type Fase = "libre" | "identidad" | "ubicando" | "enviando";

/** Las opciones de huella se renuevan antes de que venza el desafío (5 min). */
const RENOVAR_OPCIONES_MS = 4 * 60_000;

// ---------------------------------------------------------------------------
// Geolocalización del navegador envuelta en una promesa
// ---------------------------------------------------------------------------

type LecturaNavegador =
  | { ok: true; lat: number; lng: number; precision: number }
  | { ok: false; motivo: string };

function leerUbicacion(): Promise<LecturaNavegador> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve({ ok: false, motivo: "Este navegador no soporta ubicación." });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy, // metros
        }),
      (err) => {
        const motivos: Record<number, string> = {
          [err.PERMISSION_DENIED]:
            "Permiso de ubicación denegado. Actívalo en los ajustes del navegador.",
          [err.POSITION_UNAVAILABLE]: "No se pudo obtener la ubicación (GPS apagado o sin señal).",
          [err.TIMEOUT]: "La ubicación tardó demasiado. Intenta cerca de una ventana.",
        };
        resolve({ ok: false, motivo: motivos[err.code] ?? "Error de ubicación desconocido." });
      },
      {
        enableHighAccuracy: true, // fuerza GPS en celulares
        timeout: 15_000,
        maximumAge: 0, // no usar una posición guardada en caché
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function MarcajePanel({
  nombre,
  marcasHoy,
  horarioHoy,
  huellaActiva,
  identidadExigida,
}: {
  nombre: string;
  marcasHoy: Marcacion[];
  /** true si la persona ya registró su huella en un celular */
  huellaActiva: boolean;
  /** false si IDENTIDAD_MODO=desactivado */
  identidadExigida: boolean;
  /** "08:30 a 14:00 · Semana A", "Hoy no tienes turno" o null si no tiene horario */
  horarioHoy: string | null;
}) {
  const [fase, setFase] = useState<Fase>("libre");
  const [tipoActivo, setTipoActivo] = useState<TipoEvento | null>(null);
  const [resultado, setResultado] = useState<ResultadoMarcaje | null>(null);
  const [avisoUbicacion, setAvisoUbicacion] = useState<string | null>(null);

  // Huella: las opciones se piden ANTES del toque (Safari exige que la huella
  // se solicite directo desde el toque, sin esperar al servidor).
  const opcionesRef = useRef<{ datos: PublicKeyCredentialRequestOptionsJSON; en: number } | null>(null);

  const renovarOpciones = useCallback(async () => {
    if (!huellaActiva) return;
    try {
      const datos = await prepararVerificacion();
      opcionesRef.current = datos ? { datos, en: Date.now() } : null;
    } catch {
      opcionesRef.current = null;
    }
  }, [huellaActiva]);

  useEffect(() => {
    if (!huellaActiva) return;
    renovarOpciones();
    const id = setInterval(renovarOpciones, RENOVAR_OPCIONES_MS);
    const alVolver = () => document.visibilityState === "visible" && renovarOpciones();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [huellaActiva, renovarOpciones]);

  // Foto opcional
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);

  const ultimo = marcasHoy.at(-1)?.tipo ?? null;
  const permitidos = siguientesPermitidos(ultimo);
  const ocupado = fase !== "libre";
  const jornadaCerrada = permitidos.length === 0;

  function guardarFoto(blob: Blob) {
    if (foto) URL.revokeObjectURL(foto.url);
    setFoto({ blob, url: URL.createObjectURL(blob) });
    setCamaraAbierta(false);
  }

  function quitarFoto() {
    if (foto) URL.revokeObjectURL(foto.url);
    setFoto(null);
  }

  async function marcar(tipo: TipoEvento) {
    if (ocupado) return;

    setTipoActivo(tipo);
    setResultado(null);
    setAvisoUbicacion(null);

    // 0. Identidad: huella / rostro (lo primero tras el toque)
    let identidad: string | null = null;
    if (huellaActiva) {
      setFase("identidad");
      try {
        let op = opcionesRef.current;
        if (!op || Date.now() - op.en > RENOVAR_OPCIONES_MS) {
          await renovarOpciones();
          op = opcionesRef.current;
        }
        if (!op) throw new Error("sin-opciones");
        const respuesta = await startAuthentication({ optionsJSON: op.datos });
        identidad = JSON.stringify(respuesta);
        opcionesRef.current = null; // el desafío es de un solo uso
      } catch (e) {
        const nombreError = (e as { name?: string })?.name;
        setResultado({
          ok: false,
          mensaje:
            nombreError === "NotAllowedError"
              ? "No se confirmó tu huella o rostro. Toca el botón otra vez."
              : "No se pudo usar la huella en este momento. Toca el botón otra vez.",
        });
        setFase("libre");
        setTipoActivo(null);
        renovarOpciones();
        return;
      }
    }

    // 1. Ubicación
    setFase("ubicando");
    const lectura = await leerUbicacion();
    if (!lectura.ok) setAvisoUbicacion(lectura.motivo);

    // 2. Envío (aunque no haya ubicación: el servidor la marcará en revisión)
    setFase("enviando");
    const fd = new FormData();
    fd.set("tipo", tipo);
    if (lectura.ok) {
      fd.set("lat", String(lectura.lat));
      fd.set("lng", String(lectura.lng));
      fd.set("precision", String(lectura.precision));
    }
    if (foto) fd.set("foto", foto.blob, "foto.jpg");
    if (identidad) fd.set("identidad", identidad);

    try {
      const r = await registrarMarcaje(fd);
      setResultado(r);
      if (r.ok) quitarFoto(); // la foto ya se usó
    } catch {
      setResultado({ ok: false, mensaje: "Sin conexión con el servidor. Intenta otra vez." });
    } finally {
      setFase("libre");
      setTipoActivo(null);
      renovarOpciones(); // nuevo desafío para la próxima marca
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      {/* Encabezado */}
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Hola,</p>
            <h1 className="text-2xl font-semibold text-slate-900">{nombre}</h1>
          </div>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              <LogOut className="size-4" aria-hidden /> Salir
            </button>
          </form>
        </div>
        <Reloj />
        {huellaActiva && (
          <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Fingerprint className="size-3.5" aria-hidden /> Marcas con huella activadas
          </p>
        )}
        {horarioHoy && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800 ring-1 ring-sky-200">
            <CalendarClock className="size-4" aria-hidden />
            {horarioHoy.startsWith("Hoy") ? horarioHoy : `Tu horario hoy: ${horarioHoy}`}
          </p>
        )}
      </header>

      {/* Activar huella (si se exige y aún no la tiene) */}
      {identidadExigida && !huellaActiva && <ActivarHuella />}

      {/* Foto opcional */}
      {!jornadaCerrada && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          {foto ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt="Foto tomada" className="size-16 rounded-xl object-cover" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-slate-800">Foto lista</p>
                <p className="text-slate-500">Se enviará con tu próxima marca.</p>
              </div>
              <button
                type="button"
                onClick={quitarFoto}
                disabled={ocupado}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Quitar foto"
              >
                <X className="size-5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCamaraAbierta(true)}
              disabled={ocupado}
              className="flex w-full items-center gap-3 text-left"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <Camera className="size-6" aria-hidden />
              </span>
              <span className="text-sm">
                <span className="block font-medium text-slate-800">Agregar foto</span>
                <span className="text-slate-500">Opcional · se toma con la cámara</span>
              </span>
            </button>
          )}
        </section>
      )}

      {/* Botones */}
      <section className="grid grid-cols-2 gap-4" aria-label="Marcar asistencia">
        {BOTONES.map(({ tipo, icono: Icono, color }) => {
          const habilitado = permitidos.includes(tipo) && !ocupado;
          const cargando = tipoActivo === tipo && ocupado;

          return (
            <button
              key={tipo}
              type="button"
              onClick={() => marcar(tipo)}
              disabled={!habilitado}
              className={`flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl text-white shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${color}`}
            >
              {cargando ? (
                <Loader2 className="size-12 animate-spin" aria-hidden />
              ) : (
                <Icono className="size-12" aria-hidden />
              )}
              <span className="text-xl font-semibold">{ETIQUETAS[tipo]}</span>
            </button>
          );
        })}
      </section>

      {/* Estado del proceso */}
      <div aria-live="polite" className="space-y-3">
        {fase === "identidad" && (
          <Aviso icono={Fingerprint} tono="info">
            Confirma con tu huella o rostro…
          </Aviso>
        )}
        {fase === "ubicando" && (
          <Aviso icono={MapPin} tono="info">
            Obteniendo tu ubicación…
          </Aviso>
        )}
        {fase === "enviando" && (
          <Aviso icono={Loader2} tono="info" girar>
            {foto ? "Registrando y subiendo foto…" : "Registrando…"}
          </Aviso>
        )}
        {avisoUbicacion && fase === "libre" && (
          <Aviso icono={TriangleAlert} tono="alerta">
            {avisoUbicacion}
          </Aviso>
        )}
        {resultado && (
          <Aviso
            icono={!resultado.ok ? XCircle : resultado.valida ? CheckCircle2 : TriangleAlert}
            tono={!resultado.ok ? "error" : resultado.valida ? "ok" : "alerta"}
          >
            {resultado.mensaje}
          </Aviso>
        )}
        {resultado?.ok && resultado.puntualidad && (
          <Aviso
            icono={resultado.puntualidad.aTiempo ? Timer : TriangleAlert}
            tono={resultado.puntualidad.aTiempo ? "ok" : "alerta"}
          >
            <strong>{resultado.puntualidad.texto}</strong>
          </Aviso>
        )}
      </div>

      {/* Marcas de hoy */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Clock className="size-4" aria-hidden /> Tus marcas de hoy
        </h2>

        {marcasHoy.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no registras marcas hoy.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {marcasHoy.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-slate-800">
                    {ETIQUETAS[m.tipo]}
                    {m.foto_path && (
                      <ImageIcon className="size-3.5 text-slate-400" aria-label="Con foto" />
                    )}
                  </p>
                  {!m.valida && m.motivo_observacion && (
                    <p className="text-xs text-amber-700">{m.motivo_observacion}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 tabular-nums text-slate-600">
                  {formatearHora(m.marcado_en)}
                  {m.valida ? (
                    <CheckCircle2 className="size-4 text-emerald-600" aria-label="Válida" />
                  ) : (
                    <TriangleAlert className="size-4 text-amber-500" aria-label="En revisión" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {camaraAbierta && (
        <CamaraFoto onCapturar={guardarFoto} onCerrar={() => setCamaraAbierta(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

function formatearHora(iso: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA,
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Reloj en vivo. Se monta solo en el cliente para evitar diferencias de hidratación. */
function Reloj() {
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (!ahora) return <p className="h-9" aria-hidden />;

  return (
    <div>
      <p className="text-3xl font-bold tabular-nums text-slate-900">
        {new Intl.DateTimeFormat("es-CL", {
          timeZone: ZONA,
          hour: "2-digit",
          hourCycle: "h23",
          minute: "2-digit",
          second: "2-digit",
        }).format(ahora)}
      </p>
      <p className="text-sm capitalize text-slate-500">
        {new Intl.DateTimeFormat("es-CL", {
          timeZone: ZONA,
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(ahora)}
      </p>
    </div>
  );
}

const TONOS = {
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  alerta: "bg-amber-50 text-amber-800 ring-amber-200",
  error: "bg-rose-50 text-rose-800 ring-rose-200",
} as const;

function Aviso({
  icono: Icono,
  tono,
  girar,
  children,
}: {
  icono: LucideIcon;
  tono: keyof typeof TONOS;
  girar?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl p-4 text-sm ring-1 ${TONOS[tono]}`}>
      <Icono className={`mt-0.5 size-5 shrink-0 ${girar ? "animate-spin" : ""}`} aria-hidden />
      <p>{children}</p>
    </div>
  );
}
