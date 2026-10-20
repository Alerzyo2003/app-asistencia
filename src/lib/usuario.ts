/**
 * Nombres de usuario para iniciar sesión (compartido cliente/servidor).
 *
 * Reglas: 3 a 30 caracteres, minúsculas, letras sin tilde, números, punto,
 * guion y guion bajo. Ej.: "jorgeopazo", "maria.perez".
 */

export const RE_USUARIO = /^[a-z0-9._-]{3,30}$/;

/**
 * Prefijo de los correos internos que se asignan a quien no tiene correo.
 * Formato: asistencia+<usuario>@<dominio>. Nunca se envía nada a esas
 * direcciones: solo existen porque Supabase Auth exige un correo por cuenta.
 */
export const PREFIJO_CORREO_INTERNO = "asistencia+";

/** "  Jorge.Opazo " → "jorge.opazo" */
export function normalizarUsuario(texto: string): string {
  return texto.trim().toLowerCase();
}

export function esUsuarioValido(usuario: string): boolean {
  return RE_USUARIO.test(usuario);
}

/**
 * Sugiere un usuario a partir del nombre: "Jorge Opazo Muñoz" → "jorgeopazo".
 * Usa el primer nombre + primer apellido, sin tildes ni espacios.
 */
export function sugerirUsuario(nombre: string): string {
  const partes = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes (ñ → n)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  return partes.slice(0, 2).join("").slice(0, 30);
}

export function esCorreoInterno(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().startsWith(PREFIJO_CORREO_INTERNO));
}

/** Correo para mostrar en pantalla ("—" si es interno). */
export function correoVisible(email: string | null | undefined): string {
  return !email || esCorreoInterno(email) ? "—" : email;
}
