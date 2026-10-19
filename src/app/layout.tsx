import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asistencia · Clínica Dignidad",
  description: "Control de asistencia interno",
  robots: { index: false, follow: false }, // app interna: fuera de Google
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0284c7",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CL">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
