"use client";
import { createBrowserClient } from "@supabase/ssr";

// Cliente de navegador (clave anon) con la sesión de Auth en COOKIES
// (@supabase/ssr), para que el middleware y los server components la vean.
// Lo usan la bitácora (Realtime), el login y el hook de sesión useUsuario.
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("TU-PROYECTO")) return null; // sin configurar (modo demo)
  browserClient = createBrowserClient(url, key);
  return browserClient;
}
