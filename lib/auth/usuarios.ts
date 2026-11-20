import { MODULOS_OTORGABLES, ROLES, type RolPlataforma } from "@/lib/auth/modulos";

/** Normaliza los módulos adicionales permitidos para una cuenta. */
export function limpiarModulos(v: unknown): string[] {
  const permitidos = new Set(MODULOS_OTORGABLES.map((modulo) => modulo.id));
  return Array.isArray(v)
    ? [...new Set(v.map(String).filter((id) => permitidos.has(id)))]
    : [];
}

export function normalizarEmail(v: unknown): string | null {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizarNombre(v: unknown): string | null {
  const nombre = typeof v === "string" ? v.trim() : "";
  return nombre || null;
}

export function esRolUsuario(v: unknown): v is RolPlataforma {
  return typeof v === "string" && ROLES.includes(v as RolPlataforma);
}

/** Impide que el superadmin retire su propio rol privilegiado. */
export function puedeCambiarRolPropio(uid: string, id: string, rol: unknown): boolean {
  return uid !== id || rol === "superadmin";
}

/** Impide que el superadmin elimine su propia cuenta. */
export function puedeEliminarCuentaPropia(uid: string, id: string): boolean {
  return uid !== id;
}
