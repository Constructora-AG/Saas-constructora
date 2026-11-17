const CALLBACK_PATH = "/auth/callback";

export function obtenerUrlCallbackAuth(): URL {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_AUTH_CALLBACK ||
    process.env.NEXT_PUBLIC_SUPABASE_INVITATION_CALLBACK;
  if (!value) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_AUTH_CALLBACK en el entorno.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_AUTH_CALLBACK debe ser una URL absoluta válida.",
    );
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== CALLBACK_PATH ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_AUTH_CALLBACK debe apuntar exactamente a /auth/callback.",
    );
  }

  return url;
}

// Alias de compatibilidad para los consumidores antiguos.
export const obtenerUrlCallbackInvitacion = obtenerUrlCallbackAuth;
