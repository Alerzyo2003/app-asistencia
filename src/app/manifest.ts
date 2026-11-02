import type { MetadataRoute } from "next";

/** Permite agregar la app a la pantalla de inicio con el logo de la clínica. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Asistencia Clínica Dignidad",
    short_name: "Asistencia",
    description: "Control de asistencia interno",
    lang: "es-CL",
    start_url: "/",
    display: "standalone",
    background_color: "#061b3a",
    theme_color: "#061b3a",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
