import type { NextRequest } from "next/server";

// Llamadas máquina-a-máquina a las rutas de sync.
// · Cron de Vercel: envía `Authorization: Bearer <CRON_SECRET>` cuando esa variable existe.
// · Manual: `Authorization: Bearer <CARTERA_SYNC_SECRET>` o `?secret=`.
// No se confía en encabezados como x-vercel-cron, que cualquiera puede enviar.
export function syncAutorizado(req: NextRequest): boolean {
  const cron = process.env.CRON_SECRET;
  const manual = process.env.CARTERA_SYNC_SECRET;
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  if (cron && bearer === cron) return true;
  if (!manual) return false;
  return (bearer ?? req.nextUrl.searchParams.get("secret")) === manual;
}
