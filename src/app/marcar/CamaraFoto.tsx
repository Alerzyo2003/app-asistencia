"use client";

/**
 * Cámara en vivo para tomar la foto de la marcación.
 *
 * Usa getUserMedia (la cámara del navegador) en vez de <input type="file">:
 * así NO existe la opción de elegir una imagen de la galería. La foto se
 * toma del video en ese momento, se reduce a ~720 px y se comprime a JPEG.
 *
 * Requisito: HTTPS (o localhost) y permiso de cámara.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, SwitchCamera, X } from "lucide-react";

const ANCHO_MAX = 720;
const CALIDAD_JPEG = 0.75;

type Props = {
  onCapturar: (foto: Blob) => void;
  onCerrar: () => void;
};

export function CamaraFoto({ onCapturar, onCerrar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [frontal, setFrontal] = useState(true);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captura, setCaptura] = useState<{ blob: Blob; url: string } | null>(null);

  const detener = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Encender la cámara (y reiniciarla al cambiar frontal/trasera)
  useEffect(() => {
    let cancelado = false;

    async function iniciar() {
      setListo(false);
      setError(null);
      detener();

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no permite usar la cámara (se necesita HTTPS).");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: frontal ? "user" : "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setListo(true);
      } catch (e) {
        const nombre = (e as DOMException)?.name;
        setError(
          nombre === "NotAllowedError"
            ? "No diste permiso para usar la cámara. Actívalo en los ajustes del navegador."
            : nombre === "NotFoundError"
              ? "No se encontró una cámara en este dispositivo."
              : "No se pudo abrir la cámara.",
        );
      }
    }

    iniciar();
    return () => {
      cancelado = true;
      detener();
    };
  }, [frontal, detener]);

  // Liberar la URL de vista previa al descartarla
  useEffect(() => () => {
    if (captura) URL.revokeObjectURL(captura.url);
  }, [captura]);

  function tomarFoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const escala = Math.min(1, ANCHO_MAX / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) setCaptura({ blob, url: URL.createObjectURL(blob) });
      },
      "image/jpeg",
      CALIDAD_JPEG,
    );
  }

  function usarFoto() {
    if (!captura) return;
    detener();
    onCapturar(captura.blob);
  }

  function cerrar() {
    detener();
    onCerrar();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tomar foto"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
    >
      <div className="flex items-center justify-between p-4">
        <p className="font-medium">Foto de la marcación</p>
        <button
          type="button"
          onClick={cerrar}
          className="rounded-full p-2 hover:bg-white/10"
          aria-label="Cerrar cámara"
        >
          <X className="size-6" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="max-w-xs px-6 text-center text-sm text-white/80">{error}</p>
        ) : captura ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captura.url} alt="Vista previa" className="max-h-full max-w-full object-contain" />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`max-h-full max-w-full object-contain ${frontal ? "-scale-x-100" : ""}`}
            />
            {!listo && <Loader2 className="absolute size-10 animate-spin text-white/70" />}
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 p-6 pb-10">
        {captura ? (
          <>
            <button
              type="button"
              onClick={() => setCaptura(null)}
              className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 font-medium hover:bg-white/20"
            >
              <RefreshCw className="size-5" /> Repetir
            </button>
            <button
              type="button"
              onClick={usarFoto}
              className="flex items-center gap-2 rounded-full bg-sky-500 px-6 py-3 font-semibold hover:bg-sky-600"
            >
              <Camera className="size-5" /> Usar foto
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setFrontal((f) => !f)}
              disabled={!!error}
              className="rounded-full bg-white/10 p-3 hover:bg-white/20 disabled:opacity-40"
              aria-label="Cambiar cámara"
            >
              <SwitchCamera className="size-6" />
            </button>
            <button
              type="button"
              onClick={tomarFoto}
              disabled={!listo}
              className="size-18 rounded-full border-4 border-white bg-white/20 transition active:scale-95 disabled:opacity-40"
              aria-label="Tomar foto"
            />
            <span className="size-12" aria-hidden />
          </>
        )}
      </div>
    </div>
  );
}
