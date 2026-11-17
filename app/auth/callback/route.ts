import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { obtenerUrlCallbackAuth } from "@/lib/auth/invitationCallback";

const DESTINOS_PERMITIDOS = new Set([
  "/auth/establecer-contrasena",
  "/auth/restablecer-contrasena",
]);

function redireccionError(origin: URL): NextResponse {
  return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
}

// Completa los enlaces de Auth intercambiando su código de autorización de un solo uso
// por una sesión SSR y luego redirige a un destino interno previamente permitido.
export async function GET(request: NextRequest) {
  let callbackUrl: URL;
  try {
    callbackUrl = obtenerUrlCallbackAuth();
  } catch {
    return redireccionError(new URL(request.url));
  }

  if (request.nextUrl.origin !== callbackUrl.origin) {
    return redireccionError(callbackUrl);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return redireccionError(callbackUrl);
  }

  const supabase = await supabaseServer();
  if (!supabase) {
    return redireccionError(callbackUrl);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redireccionError(callbackUrl);
  }

  const requestedNext = request.nextUrl.searchParams.get("next");
  const destination = requestedNext && DESTINOS_PERMITIDOS.has(requestedNext)
    ? requestedNext
    : "/auth/establecer-contrasena";

  return NextResponse.redirect(new URL(destination, callbackUrl));
}
