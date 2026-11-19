import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export class SupabaseConfigurationError extends Error {
  /** Identifica una configuración incompleta sin degradar a la clave pública. */
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

// Cliente de servidor con service_role: salta RLS. Úsalo SOLO en rutas de servidor
// (sync, escrituras de bitácora). Nunca lo expongas al navegador.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Las operaciones administrativas deben fallar si falta service_role: usar
  // anon aquí ocultaría errores de despliegue y haría depender la seguridad de RLS.
  if (!url || !key) throw new SupabaseConfigurationError("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Cliente de servidor con service_role para el MÓDULO TRANSPORTE AAA, que vive
// en un Supabase self-hosted (Coolify) SEPARADO del Supabase principal de la
// plataforma. Nunca usa la clave pública como respaldo ni se expone al navegador.
export function supabaseTransporte() {
  const url = process.env.TRANSPORTE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.TRANSPORTE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Transporte puede vivir en otro proyecto, pero siempre requiere una clave
  // privilegiada; nunca debe continuar con NEXT_PUBLIC_SUPABASE_ANON_KEY.
  if (!url || !key) throw new SupabaseConfigurationError("Faltan credenciales privilegiadas de Supabase para Transporte AAA");
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
