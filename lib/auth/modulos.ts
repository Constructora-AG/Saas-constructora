// ════════════════════════════════════════════════════════════════════
// Módulos de la plataforma y roles por sección.
//   · superadmin → todo (incluye Usuarios y roles y Configuración IA).
//   · El Asistente IA lo ven todos; su alcance de datos lo fija el rol
//     (lib/asistente/alcance.ts).
//   · operacion  → Resumen, Cartera, Bitácora, Recaudo, Vendedores.
//   · comercial  → Marketing y leads.
//   · finanzas   → Proyecto Triple A, Transporte AAA.
// Además, cada usuario puede tener `modulos` extra otorgados por el super
// admin (columna usuarios.modulos). puedeVer() combina ambas cosas.
// ════════════════════════════════════════════════════════════════════

export type RolPlataforma = "superadmin" | "operacion" | "comercial" | "finanzas";

export const ROLES: RolPlataforma[] = ["superadmin", "operacion", "comercial", "finanzas"];

export const ROL_LABELS: Record<RolPlataforma, string> = {
  superadmin: "Super admin",
  operacion: "Operación",
  comercial: "Comercial",
  finanzas: "Finanzas",
};

export const ROL_DESC: Record<RolPlataforma, string> = {
  superadmin: "Acceso total a todos los módulos, a toda la información del Asistente IA y a la administración de usuarios.",
  operacion: "Resumen, Cartera, Bitácora, Recaudo y Vendedores.",
  comercial: "Marketing y gestión de leads.",
  finanzas: "Proyecto Triple A, Transporte AAA y Contrato de Alquiler.",
};

export interface Modulo {
  id: string;
  label: string;
  href: string;
  seccion: "Operación" | "Comercial" | "Finanzas" | "Administración";
  /** Solo superadmin; no se puede otorgar como módulo extra. */
  soloSuperadmin?: boolean;
}

export const MODULOS: Modulo[] = [
  { id: "resumen", label: "Resumen", href: "/", seccion: "Operación" },
  { id: "cartera", label: "Cartera", href: "/cartera", seccion: "Operación" },
  { id: "bitacora", label: "Bitácora", href: "/cobranza", seccion: "Operación" },
  { id: "recaudo", label: "Recaudo", href: "/recaudo", seccion: "Operación" },
  { id: "vendedores", label: "Vendedores", href: "/supervision", seccion: "Operación" },
  { id: "marketing", label: "Marketing y leads", href: "/marketing", seccion: "Comercial" },
  { id: "aaa", label: "Proyecto Triple A", href: "/aaa", seccion: "Finanzas" },
  { id: "transporte", label: "Transporte AAA", href: "/aaa/transporte", seccion: "Finanzas" },
  { id: "alquiler", label: "Contrato de Alquiler", href: "/aaa/contrato-alquiler", seccion: "Finanzas" },
  { id: "asistente", label: "Asistente IA", href: "/asistente", seccion: "Administración" },
  { id: "configuracion_ia", label: "Configuración IA", href: "/configuracion-ia", seccion: "Administración", soloSuperadmin: true },
  { id: "usuarios", label: "Usuarios y roles", href: "/usuarios", seccion: "Administración", soloSuperadmin: true },
];

/** Módulos que cada rol ve por defecto. */
export const ROL_MODULOS: Record<RolPlataforma, string[]> = {
  superadmin: MODULOS.map((m) => m.id),
  operacion: ["resumen", "cartera", "bitacora", "recaudo", "vendedores", "asistente"],
  comercial: ["marketing", "asistente"],
  finanzas: ["aaa", "transporte", "alquiler", "asistente"],
};

/** Módulos otorgables como extra (todos menos los exclusivos de superadmin). */
export const MODULOS_OTORGABLES = MODULOS.filter((m) => !m.soloSuperadmin);

export function esRol(v: unknown): v is RolPlataforma {
  return ROLES.includes(v as RolPlataforma);
}

/** ¿El usuario (rol + extras) puede ver el módulo? */
export function puedeVer(u: { rol: RolPlataforma; modulos?: string[] } | null | undefined, moduloId: string): boolean {
  if (!u) return false;
  if (u.rol === "superadmin") return true;
  const m = MODULOS.find((x) => x.id === moduloId);
  if (!m || m.soloSuperadmin) return false;
  return ROL_MODULOS[u.rol].includes(moduloId) || (u.modulos ?? []).includes(moduloId);
}

/** Módulo al que pertenece una ruta (la más específica). */
export function moduloDeRuta(path: string): Modulo | null {
  const cands = MODULOS.filter((m) => (m.href === "/" ? path === "/" : path === m.href || path.startsWith(m.href + "/")));
  return cands.sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

/** Primera ruta visible para el usuario (destino tras login / acceso denegado). */
export function rutaInicial(u: { rol: RolPlataforma; modulos?: string[] } | null | undefined): string {
  const m = MODULOS.find((x) => puedeVer(u, x.id));
  return m?.href ?? "/";
}
