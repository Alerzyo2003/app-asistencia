import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

/** Texto: Figtree, con números tabulares para las columnas de horas. */
const texto = localFont({
  src: "./fonts/figtree.woff2",
  weight: "300 900",
  variable: "--fuente-texto",
  display: "swap",
});

/** Títulos y reloj: Fredoka, redondeada como la palabra DIGNIDAD del logo. */
const titulo = localFont({
  src: "./fonts/fredoka.woff2",
  weight: "300 700",
  variable: "--fuente-titulo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Asistencia · Clínica Dignidad",
  description: "Control de asistencia interno",
  robots: { index: false, follow: false }, // app interna: fuera de Google
  appleWebApp: { capable: true, title: "Asistencia", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#061b3a",
  viewportFit: "cover", // respeta la muesca y la barra inferior del teléfono
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CL" className={`${texto.variable} ${titulo.variable}`}>
      <body className="bg-tinta-50 font-sans text-tinta-900 antialiased">{children}</body>
    </html>
  );
}
