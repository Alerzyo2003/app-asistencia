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

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import {
  CalendarClock,
  Camera,
  CheckCircle2,
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

/**
 * Los dos botones forman el corazón del logo: Entrada es la figura turquesa y
 * Salida la dorada. Cada mitad toma color cuando se puede marcar, y al cerrar
 * la jornada el corazón queda completo.
 */
const MITADES: {
  tipo: TipoEvento;
  icono: LucideIcon;
  fuerte: string;
  suave: string;
  textoSuave: string;
  voltear: boolean;
}[] = [
  {
    tipo: "entrada",
    icono: LogIn,
    fuerte: "fill-turquesa-500 stroke-turquesa-500",
    suave: "fill-turquesa-100 stroke-turquesa-100",
    textoSuave: "text-turquesa-800",
    voltear: false,
  },
  {
    tipo: "salida",
    icono: LogOut,
    fuerte: "fill-oro-400 stroke-oro-400",
    suave: "fill-oro-100 stroke-oro-100",
    textoSuave: "text-oro-800",
    voltear: true,
  },
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

  const horaDe = {
    entrada: marcasHoy.find((m) => m.tipo === "entrada")?.marcado_en ?? null,
    salida: marcasHoy.findLast((m) => m.tipo === "salida")?.marcado_en ?? null,
  };

  return (
    <div className="pb-seguro">
      {/* Encabezado */}
      <header className="pt-seguro rounded-b-[2.5rem] bg-noche-900 text-white">
        <div className="mx-auto max-w-md px-5 pt-4 pb-14">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Image src="/simbolo-dignidad.png" alt="" width={444} height={341} className="h-9 w-auto" />
              <h1 className="truncate text-xl">Hola, {primerNombre(nombre)}</h1>
            </div>
            <form action={cerrarSesion} className="shrink-0">
              <button
                type="submit"
                className="-mr-2 flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-noche-100 hover:bg-white/10"
              >
                <LogOut className="size-4" aria-hidden /> Salir
              </button>
            </form>
          </div>

          <Reloj />

          <div className="mt-3 flex flex-col items-center gap-2 text-center">
            {horarioHoy && (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-medium">
                <CalendarClock className="size-4 shrink-0 text-oro-400" aria-hidden />
                {horarioHoy.startsWith("Hoy") ? horarioHoy : `Tu horario hoy: ${horarioHoy}`}
              </p>
            )}
            {huellaActiva && (
              <p className="inline-flex items-center gap-1 text-xs font-medium text-turquesa-200">
                <Fingerprint className="size-3.5" aria-hidden /> Marcas con huella activadas
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="relative mx-auto -mt-10 flex max-w-md flex-col gap-5 px-4 pb-8">
        {/* Activar huella (si se exige y aún no la tiene) */}
        {identidadExigida && !huellaActiva && <ActivarHuella />}

        {/* Botones */}
        <section
          className={`grid grid-cols-2 ${resultado?.ok && jornadaCerrada ? "animate-corazon" : ""}`}
          aria-label="Marcar asistencia"
        >
          {MITADES.map(({ tipo, icono: Icono, fuerte, suave, textoSuave, voltear }) => {
            const habilitado = permitidos.includes(tipo) && !ocupado;
            const cargando = tipoActivo === tipo && ocupado;
            const marcadaA = horaDe[tipo];
            const conColor = permitidos.includes(tipo) || jornadaCerrada;

            return (
              <button
                key={tipo}
                type="button"
                onClick={() => marcar(tipo)}
                disabled={!habilitado}
                className="relative aspect-[200/308] rounded-3xl transition enabled:hover:brightness-105 enabled:active:scale-[0.98] disabled:cursor-not-allowed"
              >
                <svg
                  viewBox="0 0 200 308"
                  aria-hidden
                  className={`absolute inset-0 size-full overflow-visible drop-shadow-sm ${voltear ? "-scale-x-100" : ""}`}
                >
                  <path
                    d="M193 66C176 28 142 7 104 7C48 7 7 50 7 108C7 190 108 240 193 301Z"
                    strokeWidth="8"
                    strokeLinejoin="round"
                    className={`transition-colors ${conColor ? fuerte : suave}`}
                  />
                </svg>

                <span
                  className={`absolute inset-x-0 top-[15%] flex flex-col items-center gap-0.5 ${
                    conColor ? "text-noche-900" : textoSuave
                  }`}
                >
                  {cargando ? (
                    <Loader2 className="size-9 animate-spin" aria-hidden />
                  ) : marcadaA ? (
                    <CheckCircle2 className="size-9" aria-hidden />
                  ) : (
                    <Icono className="size-9" aria-hidden />
                  )}
                  <span className="font-titulo text-2xl font-medium">{ETIQUETAS[tipo]}</span>
                  {marcadaA && (
                    <span className="text-sm font-semibold tabular-nums">{formatearHora(marcadaA)}</span>
                  )}
                </span>
              </button>
            );
          })}
        </section>

        {jornadaCerrada && (
          <p className="-mt-3 text-center font-titulo text-lg font-medium text-noche-900">
            Jornada completa
          </p>
        )}

        {/* Estado del proceso */}
        <div aria-live="polite" className="space-y-3 empty:hidden">
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

        {/* Foto opcional */}
        {!jornadaCerrada && (
          <section className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-tinta-200">
            {foto ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto.url} alt="Foto tomada" className="size-14 rounded-2xl object-cover" />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-tinta-800">Foto lista</p>
                  <p className="text-tinta-500">Se enviará con tu próxima marca.</p>
                </div>
                <button
                  type="button"
                  onClick={quitarFoto}
                  disabled={ocupado}
                  className="flex size-11 items-center justify-center rounded-full text-tinta-500 hover:bg-tinta-100"
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
                <span className="flex size-11 items-center justify-center rounded-2xl bg-turquesa-50 text-turquesa-600">
                  <Camera className="size-6" aria-hidden />
                </span>
                <span className="text-sm">
                  <span className="block font-medium text-tinta-800">Agregar foto</span>
                  <span className="text-tinta-500">Opcional, se toma antes de marcar</span>
                </span>
              </button>
            )}
          </section>
        )}

        {/* Marcas de hoy */}
        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-tinta-200">
          <h2 className="mb-2 text-lg text-noche-900">Tus marcas de hoy</h2>

          {marcasHoy.length === 0 ? (
            <p className="text-sm text-tinta-500">Aún no registras marcas hoy.</p>
          ) : (
            <ul className="divide-y divide-tinta-100">
              {marcasHoy.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="flex gap-2.5">
                    <span
                      className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                        m.tipo === "entrada"
                          ? "bg-turquesa-500"
                          : m.tipo === "salida"
                            ? "bg-oro-400"
                            : "bg-tinta-300"
                      }`}
                      aria-hidden
                    />
                    <div>
                      <p className="flex items-center gap-1.5 font-medium text-tinta-800">
                        {ETIQUETAS[m.tipo]}
                        {m.foto_path && (
                          <ImageIcon className="size-3.5 text-tinta-400" aria-label="Con foto" />
                        )}
                      </p>
                      {!m.valida && m.motivo_observacion && (
                        <p className="text-xs text-oro-700">{m.motivo_observacion}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 font-medium tabular-nums text-tinta-700">
                    {formatearHora(m.marcado_en)}
                    {m.valida ? (
                      <CheckCircle2 className="size-4 text-verde-600" aria-label="Válida" />
                    ) : (
                      <TriangleAlert className="size-4 text-oro-600" aria-label="En revisión" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {camaraAbierta && (
        <CamaraFoto onCapturar={guardarFoto} onCerrar={() => setCamaraAbierta(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

/** "Jorge Opazo Mardones" → "Jorge"; "Dr. Víctor Morgado" → "Dr. Víctor" */
function primerNombre(nombre: string) {
  const [primera, segunda] = nombre.trim().split(/\s+/);
  return primera.endsWith(".") && segunda ? `${primera} ${segunda}` : primera;
}

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

  const hora = ahora
    ? new Intl.DateTimeFormat("es-CL", {
        timeZone: ZONA,
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        second: "2-digit",
      }).format(ahora)
    : null;

  return (
    <div className="mt-5 h-24 text-center">
      {hora && (
        <>
          <p className="font-titulo text-6xl font-medium" role="timer">
            <span className="sr-only">{hora}</span>
            {/* Fredoka no trae números tabulares: cada cifra ocupa una celda fija para que el reloj no salte */}
            <span aria-hidden>
              {[...hora].map((c, i) => (
                <span
                  key={i}
                  className={`inline-block text-center ${c === ":" ? "w-[0.3em] text-noche-300" : "w-[0.62em]"}`}
                >
                  {c}
                </span>
              ))}
            </span>
          </p>
          <p className="mt-1 text-sm text-noche-100 first-letter:uppercase">
            {new Intl.DateTimeFormat("es-CL", {
              timeZone: ZONA,
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(ahora!)}
          </p>
        </>
      )}
    </div>
  );
}

const TONOS = {
  info: "bg-turquesa-50 text-turquesa-900 ring-turquesa-200",
  ok: "bg-verde-50 text-verde-800 ring-verde-200",
  alerta: "bg-oro-50 text-oro-800 ring-oro-200",
  error: "bg-carmin-50 text-carmin-800 ring-carmin-200",
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
    <div className={`flex items-start gap-3 rounded-3xl p-4 text-sm ring-1 ${TONOS[tono]}`}>
      <Icono className={`mt-0.5 size-5 shrink-0 ${girar ? "animate-spin" : ""}`} aria-hidden />
      <p>{children}</p>
    </div>
  );
}
