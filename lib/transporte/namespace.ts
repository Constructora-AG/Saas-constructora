export interface ResolvedTransporteNamespace {
  ns: string;
  prefix: string;
  modulo: string;
}

/** Resuelve el namespace, el prefijo persistido y el módulo que lo protege. */
export function resolveTransporteNamespace(value: unknown): ResolvedTransporteNamespace | null {
  const ns = String(value ?? "transporte").trim() || "transporte";
  if (!/^[a-z0-9-]+$/.test(ns)) return null;
  if (ns === "transporte") return { ns, prefix: "", modulo: "transporte" };
  if (ns === "alquiler" || ns === "emergencia") return { ns, prefix: `${ns}:`, modulo: ns };
  return { ns, prefix: `${ns}:`, modulo: "contratos" };
}

/** Variante para cuerpos POST o peticiones de adjuntos. */
export function authorizeNamespaceValue(value: unknown): ResolvedTransporteNamespace | null {
  return resolveTransporteNamespace(value);
}

/** Comprueba que una clave solo pertenezca al namespace autorizado. */
export function keyBelongsToNamespace(key: string, access: { prefix: string }): boolean {
  if (access.prefix) return key.startsWith(access.prefix) && key.length > access.prefix.length;
  return !key.includes(":") || /^services:\d{4}-\d{2}$/.test(key);
}
