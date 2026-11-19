import { NextRequest, NextResponse } from "next/server";
import { exigirModulo, esRespuestaAutorizacion, type UsuarioServidor } from "@/lib/auth/servidor";

export interface TransporteNamespaceAccess {
  usuario: UsuarioServidor;
  ns: string;
  prefix: string;
}

/**
 * Resuelve el espacio de datos y el módulo que lo protege.
 * El namespace determina tanto el prefijo de las claves como el permiso que
 * deberá tener el usuario antes de tocar la tabla transporte_kv.
 *
 * Esta utilidad queda preparada para la próxima activación del aislamiento por
 * namespace; actualmente la API conserva el comportamiento anterior.
 */
export function resolveTransporteNamespace(value: unknown): { ns: string; prefix: string; modulo: string } | null {
  const ns = String(value ?? "transporte").trim() || "transporte";
  if (!/^[a-z0-9-]+$/.test(ns)) return null;
  if (ns === "transporte") return { ns, prefix: "", modulo: "transporte" };
  if (ns === "alquiler" || ns === "emergencia") return { ns, prefix: `${ns}:`, modulo: ns };
  return { ns, prefix: `${ns}:`, modulo: "contratos" };
}

/** Autoriza un namespace recibido en los parámetros de una petición HTTP. */
export async function authorizeTransporteNamespace(req: NextRequest): Promise<TransporteNamespaceAccess | NextResponse> {
  const resolved = resolveTransporteNamespace(req.nextUrl.searchParams.get("ns"));
  if (!resolved) return NextResponse.json({ error: "Namespace inválido" }, { status: 400 });
  const acceso = await exigirModulo(resolved.modulo);
  if (esRespuestaAutorizacion(acceso)) return acceso;
  return { usuario: acceso, ...resolved };
}

/** Variante para cuerpos POST o peticiones de adjuntos que envían el namespace en el body. */
export function authorizeNamespaceValue(value: unknown): { ns: string; prefix: string; modulo: string } | null {
  return resolveTransporteNamespace(value);
}

/** Comprueba que una clave solo pueda ser usada dentro del namespace autorizado. */
export function keyBelongsToNamespace(key: string, access: Pick<TransporteNamespaceAccess, "prefix">): boolean {
  return access.prefix ? key.startsWith(access.prefix) && key.length > access.prefix.length : !key.includes(":");
}
