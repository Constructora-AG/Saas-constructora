import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente de servidor con service_role: salta RLS. Úsalo SOLO en rutas de servidor
// (sync, escrituras de bitácora). Nunca lo expongas al navegador.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Preferimos la service_role; si aún no está, caemos a la clave pública.
  // (Válido mientras RLS esté deshabilitado en las tablas de cartera.)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / clave de Supabase");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Cliente de servidor LIGADO A LA SESIÓN del usuario (clave anon + cookies de
// Auth, patrón oficial @supabase/ssr getAll/setAll). Úsalo en server
// components / rutas que necesiten saber QUIÉN está logueado; respeta RLS.
// Devuelve null si Supabase no está configurado (modo demo).
export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("TU-PROYECTO")) return null; // sin configurar
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: sin permiso de escritura.
          // El middleware ya refresca la sesión, se puede ignorar.
        }
      },
    },
  });
}
