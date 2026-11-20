import { NextRequest, NextResponse } from "next/server";
import { exigirModulo, esRespuestaAutorizacion, type UsuarioServidor } from "@/lib/auth/servidor";
import { authorizeNamespaceValue, keyBelongsToNamespace, resolveTransporteNamespace } from "@/lib/transporte/namespace";

export { authorizeNamespaceValue, keyBelongsToNamespace, resolveTransporteNamespace } from "@/lib/transporte/namespace";

export interface TransporteNamespaceAccess {
  usuario: UsuarioServidor;
  ns: string;
  prefix: string;
}

/** Autoriza un namespace recibido en los parámetros de una petición HTTP. */
export async function authorizeTransporteNamespace(req: NextRequest): Promise<TransporteNamespaceAccess | NextResponse> {
  const resolved = resolveTransporteNamespace(req.nextUrl.searchParams.get("ns"));
  if (!resolved) return NextResponse.json({ error: "Namespace inválido" }, { status: 400 });
  const acceso = await exigirModulo(resolved.modulo);
  if (esRespuestaAutorizacion(acceso)) return acceso;
  return { usuario: acceso, ...resolved };
}

