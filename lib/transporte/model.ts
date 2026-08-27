// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Modelo de datos (Contrato IS No. 04-2026)
// Tipos TypeScript del panel; espeja el esquema de datos heredado del
// panel original (ver docs/transporte-aaa/SPEC.md §3), hoy en Supabase.
// ════════════════════════════════════════════════════════════════════

/** Valores numéricos que llegan como string desde formularios/datos legados. */
export type NumLike = string | number | null | undefined;

/** Normalizador numérico universal: "709199" → 709199; vacío/ inválido → 0. */
export function num(v: NumLike): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "."));
  return Number.isFinite(n) ? n : 0;
}

/** Como num() pero devuelve null cuando no hay dato (para capacidades/pesos opcionales). */
export function numOrNull(v: NumLike): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
}

// ── Perfiles y permisos ────────────────────────────────────────────

export type PerfilKey = "gerencia" | "renzo" | "jesus";

/** Secciones de listas maestras gobernadas por permisos. */
export type PermKey = "interventores" | "areas" | "vehiculos" | "equipos" | "festivos" | "personal";

export interface Perfil {
  label: string;
  password: string;
  /** gerencia no lleva perms (acceso total); renzo/jesus: mapa completo, default false. */
  perms?: Record<PermKey, boolean>;
}

// ── Listas maestras ────────────────────────────────────────────────

export interface Vehiculo {
  plate: string;
  /** Los sembrados traen `marca`; el formulario de Flota escribe `tipo`. UI: `tipo || marca`. */
  marca?: string;
  tipo?: string;
  modelo?: string | number | null;
  capacity: NumLike;
  driver: string;
  /** `activo !== false` se considera activo. */
  activo?: boolean;
  venceSoat?: string | null;  // 'AAAA-MM-DD'
  venceTecno?: string | null; // 'AAAA-MM-DD'
}

export interface Equipo {
  name: string;
  clase?: string;
  marca?: string;
  cantidad?: NumLike;
  weight: NumLike;
  alto?: NumLike;
  ancho?: NumLike;
  largo?: NumLike;
}

export interface PersonalItem {
  nombre: string;
  cedula: string;
  activo: boolean;
  venceLicencia: string | null; // 'AAAA-MM-DD' | null
}

export interface FestivoCustom {
  date: string; // 'AAAA-MM-DD'
  label: string;
}

// ── adminconfig ────────────────────────────────────────────────────

export interface AdminConfig {
  profiles: Record<PerfilKey, Perfil>;
  interventores: string[];
  areas: string[];
  vehiculos: Vehiculo[];
  equipos: Equipo[];
  personal: PersonalItem[];
  festivosCustom: FestivoCustom[];
  contractStart: string; // 'AAAA-MM-DD'
  contractEnd: string;   // 'AAAA-MM-DD' (inclusiva) o ''
  backupLastAt: string | null; // ISO
  seedVersion: number;
}

// ── tarifario ──────────────────────────────────────────────────────

export interface TarifarioRuta {
  id: string;      // '1.1' … '4.4'
  label: string;
  unitario: NumLike; // COP por viaje
}

export interface TarifarioCategoria {
  id: string;      // 'cat1' … 'cat4'
  label: string;
  capacidad: NumLike; // Ton sugerida
  rutas: TarifarioRuta[];
}

export interface Tarifario {
  recargos: { nocturno: NumLike; dominicalFestivo: NumLike };
  categorias: TarifarioCategoria[];
}

// ── Servicio (elemento de services:AAAA-MM) ────────────────────────

export type TipoServicio = "Programado" | "No Programado" | "Emergencia";

export interface AdjuntoFile {
  name: string;
  type: string;    // mime
  dataUrl: string; // base64 data URL
}

export interface Servicio {
  id: string;          // 's<Date.now()><hex>'
  date: string;        // 'AAAA-MM-DD' (requerido, dentro del mes)
  orderNo: string;
  serviceType: TipoServicio | string;
  interventor: string;
  /** Área AAA solicitante. Alias legado en datos viejos: `areaSolicitante`. */
  areaAAA?: string;
  areaSolicitante?: string; // ALIAS LEGADO — leer siempre `areaAAA || areaSolicitante`
  plate: string;
  capacity: NumLike;   // llega como string del formulario
  driver: string;
  equipment: string;
  weight: NumLike;     // string del formulario
  pickup: string;
  destination: string;
  area: string;        // municipio / área de prestación
  hourReq: string;     // 'HH:MM'
  hourAtt: string;     // 'HH:MM'
  value: NumLike;      // string del formulario
  tolls: NumLike;      // string del formulario
  photo: boolean;
  approved: boolean;
  invoiced: boolean;
  /** Recargos aplicados (SPEC §3.3): se persisten para precargar los checkboxes al editar. */
  recargoNocturno?: boolean;
  recargoDominical?: boolean;
  notes: string;
  photoFiles: AdjuntoFile[];
  approvalFile: AdjuntoFile | null;
  tarifaCategoria: string | null; // null cuando la tarifa es manual
  tarifaRuta: string | null;
  /** Label del perfil aprobador. Alias legado en datos viejos: `aprobadoPor`. */
  approvedBy?: string;
  aprobadoPor?: string; // ALIAS LEGADO — leer siempre `approvedBy || aprobadoPor`
  approvedByKey?: PerfilKey | string;
  approvedAt?: string; // ISO
}

/** Lectura del área AAA respetando el alias legado. */
export function areaAAADe(s: Servicio): string {
  return s.areaAAA || s.areaSolicitante || "";
}

/** Lectura del aprobador respetando el alias legado. */
export function aprobadorDe(s: Servicio): string {
  return s.approvedBy || s.aprobadoPor || "";
}

/** Genera un id de servicio con el mismo formato del panel original. */
export function nuevoServicioId(): string {
  return "s" + Date.now() + Math.random().toString(16).slice(2);
}

// ── Backup ─────────────────────────────────────────────────────────

export interface Backup {
  app: "control_contrato_aaa";
  version: 1;
  generatedAt: string; // ISO
  /** clave → valor tal como se guarda en storage (string JSON). */
  keys: Record<string, string>;
}

// ── Meses de la vigencia ───────────────────────────────────────────

export interface MonthInfo {
  year: number;
  month: number; // 0-11
  key: string;   // 'AAAA-MM'
  label: string; // 'julio de 2026' (es-CO)
}

// ── Alertas contractuales ──────────────────────────────────────────

export type AlertaNivel = "high" | "warn";

export interface Alerta {
  nivel: AlertaNivel;
  titulo: string;
  detalle: string;
}
