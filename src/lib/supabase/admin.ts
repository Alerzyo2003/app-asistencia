/**
 * Cliente de Supabase con la clave SECRETA (salta RLS).
 *
 * ⚠️ Solo servidor. `server-only` hace fallar el build si alguien lo importa
 * desde un componente de cliente. Úsalo únicamente después de haber
 * verificado la identidad del usuario con `createClient().auth.getUser()`.
 */
import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Clave secreta ("sb_secret_...") o la service_role antigua
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
