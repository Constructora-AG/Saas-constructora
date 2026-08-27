// ════════════════════════════════════════════════════════════════════
// Middleware de autenticación de la plataforma (Supabase Auth, @supabase/ssr).
// Protege TODAS las rutas (páginas y /api) salvo /login y los assets
// estáticos (excluidos en `config.matcher`). Sin sesión:
//   · páginas → redirect a /login (con ?next= para volver tras entrar)
//   · /api    → 401 JSON (los sync con secret/cron de Vercel sí pasan;
//               cada ruta valida su CARTERA_SYNC_SECRET por su cuenta)
// Si Supabase NO está configurado (patrón supabaseConfigured de lib/demo),
// deja pasar todo: modo demo para no romper el desarrollo local.
// ════════════════════════════════════════════════════════════════════

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("TU-PROYECTO"),
  );
}

/** Llamadas máquina-a-máquina permitidas: cron de Vercel o Bearer/?secret= correcto. */
function esSyncAutorizado(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CARTERA_SYNC_SECRET;
  if (!secret) return false;
  const auth =
    req.headers.get("authorization")?.replace("Bearer ", "") ?? req.nextUrl.searchParams.get("secret");
  return auth === secret;
}

export async function middleware(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.next(); // modo demo

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  // IMPORTANTE (@supabase/ssr): getUser() valida y refresca la sesión.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;
  const esLogin = pathname === "/login" || pathname.startsWith("/login/");

  if (!user && !esLogin) {
    if (pathname.startsWith("/api/")) {
      if (esSyncAutorizado(req)) return res;
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Con sesión, /login redirige al inicio.
  if (user && esLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // Todo menos assets estáticos de Next e imágenes/fuentes públicas.
  // OJO: los .html de /public (panel legado transporte-aaa.html) SÍ pasan
  // por aquí y quedan protegidos por la sesión.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|txt|xml|css|map)$).*)"],
};
