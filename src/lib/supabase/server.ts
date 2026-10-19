/**
 * Cliente de Supabase para Server Components y Server Actions.
 * Actúa EN NOMBRE del usuario logueado (lee su sesión desde las cookies),
 * por lo que respeta las políticas RLS.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Clave pública (publishable "sb_publishable_..." o la anon key antigua)
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component: no puede escribir cookies.
            // Es seguro ignorarlo si el middleware/proxy refresca la sesión.
          }
        },
      },
    },
  );
}
