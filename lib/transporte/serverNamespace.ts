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
 * debe tener el usuario antes de tocar la tabla transporte_kv.
 */
export function resolveTransporteNamespace(value: unknown): { ns: string; prefix: string; modulo: string } | null {
  const ns = String(value ?? "transporte").trim() || "transporte";
  if (!/^[a-z0-9-]+$/.test(ns)) return null;
  if (ns === "transporte") return { ns, prefix: "", modulo: "transporte" };
  if (ns === "alquiler" || ns === "emergencia") return { ns, prefix: `${ns}:`, modulo: ns };
  return { ns, prefix: `${ns}:`, modulo: "contratos" };
}

export async function authorizeTransporteNamespace(req: NextRequest): Promise<TransporteNamespaceAccess | NextResponse> {
  // Centraliza la autenticación de GET/DELETE para que el endpoint no pueda
  // autorizar un módulo y consultar accidentalmente los datos de otro.
  const resolved = resolveTransporteNamespace(req.nextUrl.searchParams.get("ns"));
  if (!resolved) return NextResponse.json({ error: "Namespace inválido" }, { status: 400 });
  const acceso = await exigirModulo(resolved.modulo);
  if (esRespuestaAutorizacion(acceso)) return acceso;
  return { usuario: acceso, ...resolved };
}

export function authorizeNamespaceValue(value: unknown): { ns: string; prefix: string; modulo: string } | null {
  // Variante reutilizable para cuerpos POST y endpoints de adjuntos, donde el
  // namespace llega en el body y no en la URL.
  return resolveTransporteNamespace(value);
}

export function keyBelongsToNamespace(key: string, access: Pick<TransporteNamespaceAccess, "prefix">): boolean {
  // Impide leer o escribir claves de otro contrato aunque el cliente manipule
  // directamente el parámetro key.
  return access.prefix ? key.startsWith(access.prefix) && key.length > access.prefix.length : !key.includes(":");
}
