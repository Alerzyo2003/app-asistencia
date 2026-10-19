/**
 * Fotos de las marcaciones (bucket privado en Supabase Storage).
 * Nadie puede verlas con un link público: el panel genera enlaces
 * temporales firmados que caducan.
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const BUCKET_FOTOS = "fotos-asistencia";

/** Duración de los enlaces para ver fotos en el panel. */
const VIGENCIA_SEGUNDOS = 60 * 60; // 1 hora

/** Devuelve un mapa ruta → URL firmada temporal. */
export async function urlsFirmadas(rutas: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicas = [...new Set(rutas.filter(Boolean))];
  if (unicas.length === 0) return mapa;

  const { data, error } = await createAdminClient()
    .storage.from(BUCKET_FOTOS)
    .createSignedUrls(unicas, VIGENCIA_SEGUNDOS);

  if (error) {
    console.error("[fotos] no se pudieron firmar URLs", error);
    return mapa;
  }

  for (const item of data ?? []) {
    if (item.path && item.signedUrl) mapa.set(item.path, item.signedUrl);
  }
  return mapa;
}
