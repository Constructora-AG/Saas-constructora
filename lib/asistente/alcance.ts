// ════════════════════════════════════════════════════════════════════
// Alcance de datos del asistente según los módulos que el usuario puede
// ver (rol + módulos extra). Cada área declara sus tablas; el servidor
// (1) solo describe al modelo las áreas permitidas y (2) rechaza toda
// consulta SQL que mencione una tabla fuera del alcance. Gerencia
// (superadmin) ve todo. La tabla `usuarios` nunca se expone.
// ════════════════════════════════════════════════════════════════════
import { MODULOS, puedeVer, type RolPlataforma } from "@/lib/auth/modulos";

export type Area = "cartera" | "vendedores" | "marketing" | "aaa";
export interface UsuarioAlcance { rol: RolPlataforma; modulos?: string[] }

export const AREA_LABEL: Record<Area, string> = {
  cartera: "Cartera, cobranza y recaudo",
  vendedores: "Vendedores (asesores comerciales)",
  marketing: "Marketing y leads",
  aaa: "Proyecto Triple A (Transporte, Alquiler y Prefacturas)",
};

/** Tablas/vistas que pertenecen a cada área. */
export const AREA_TABLAS: Record<Area, string[]> = {
  cartera: ["cartera", "cartera_gestion", "gestion_log", "cobradores", "sh_cuotas", "sh_abonos", "sh_eventos", "v_actividad_cobrador"],
  vendedores: ["sh_prospectos", "sh_contactos"],
  marketing: ["mk_leads", "mk_inversion", "sh_prospectos", "sh_contactos", "cartera"],
  aaa: ["aaa_prefacturas", "transporte_kv"],
};

/** Módulo de la plataforma → área de datos. */
const MODULO_AREA: Record<string, Area | undefined> = {
  resumen: "cartera", cartera: "cartera", bitacora: "cartera", recaudo: "cartera",
  vendedores: "vendedores",
  marketing: "marketing",
  aaa: "aaa", transporte: "aaa", alquiler: "aaa",
};

/** Todas las tablas conocidas (para detectar referencias en el SQL). */
export const TODAS_LAS_TABLAS = [...new Set(Object.values(AREA_TABLAS).flat())];
const PROHIBIDAS = ["usuarios", "usuarios_rol", "asistente_conversaciones", "mk_sync_estado"];

export function areasDe(u: UsuarioAlcance): Area[] {
  if (u.rol === "superadmin") return ["cartera", "vendedores", "marketing", "aaa"];
  const set = new Set<Area>();
  for (const m of MODULOS) { const a = MODULO_AREA[m.id]; if (a && puedeVer(u, m.id)) set.add(a); }
  return [...set];
}

export function tablasPermitidas(u: UsuarioAlcance): Set<string> {
  return new Set(areasDe(u).flatMap((a) => AREA_TABLAS[a]));
}

/** Valida que el SQL solo toque tablas del alcance. Devuelve el motivo del rechazo o null. */
export function validarAlcanceSql(sql: string, permitidas: Set<string>): string | null {
  const s = sql.toLowerCase();
  if (/\b(information_schema|pg_catalog|pg_[a-z_]+|auth\.|storage\.|realtime\.)/.test(s)) return "No se permite consultar catálogos del sistema ni esquemas internos.";
  const ident = new Set(s.match(/[a-z_][a-z0-9_]*/g) ?? []);
  for (const t of PROHIBIDAS) if (ident.has(t)) return `La tabla ${t} no está disponible para el asistente.`;
  const fuera = TODAS_LAS_TABLAS.filter((t) => ident.has(t) && !permitidas.has(t));
  if (fuera.length) return `Sin permiso para consultar: ${fuera.join(", ")}. El usuario solo tiene acceso a ${[...permitidas].join(", ")}.`;
  return null;
}
