// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Capa de storage (cliente de /api/aaa/transporte)
// Persistencia en Supabase (tabla transporte_kv) con el MISMO contrato del
// window.storage del panel original: valores string JSON bajo las claves
// 'adminconfig' | 'tarifario' | 'services:AAAA-MM'.
// Sin credenciales Supabase (modo demo) usa un Map en memoria: el hook
// siembra adminconfig/tarifario con applySeed y todo funciona sin backend.
// ════════════════════════════════════════════════════════════════════

import { supabaseConfigured } from "@/lib/demo";
import {
  RESTORE_TIMEOUT_MS,
  SAVE_BLOCK_CHARS,
  SAVE_WARN_CHARS,
  STORAGE_TIMEOUT_MS,
  tarifarioDefaultDe,
  TARIFARIO_COSTO_DEFAULT,
  type ModuloContrato,
} from "./constants";
import type { AdminConfig, Backup, MonthInfo, Servicio, Tarifario } from "./model";
import { normalizeAdmin } from "./constants";

const API = "/api/aaa/transporte";

// ── Espacio de datos (namespace) ───────────────────────────────────
// El mismo código sirve a varios módulos (Transporte AAA, Contrato de
// Alquiler…). Cada uno guarda sus claves con su propio prefijo en
// transporte_kv: "" para Transporte (claves históricas sin prefijo) y
// "alquiler:" para Contrato de Alquiler. useTransporte(ns) lo fija al
// renderizar; los módulos nunca están montados a la vez.
/** Espacio de datos: "transporte" | "alquiler" | "emergencia" | id de un contrato creado en la app. */
export type ModuloNs = ModuloContrato | (string & {});
const prefijoDe = (ns: ModuloNs) => (ns === "transporte" ? "" : `${ns}:`);

/** true cuando hay backend real (Supabase); false = modo demo en memoria. */
export function storageAvailable(): boolean {
  return supabaseConfigured();
}

// ── Modo demo: Map en memoria (a nivel de módulo, vive la sesión) ──
const demoStore = new Map<string, string>();

// ── Timeout genérico (mismo mensaje del panel original) ────────────
export function withTimeout<T>(p: Promise<T>, ms = STORAGE_TIMEOUT_MS, etiqueta = "storage"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Tiempo de espera agotado (${etiqueta})`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function api<T>(path: string, init?: RequestInit, etiqueta = "storage", ms = STORAGE_TIMEOUT_MS): Promise<T> {
  const res = await withTimeout(fetch(path, { cache: "no-store", ...init }), ms, etiqueta);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status} (${etiqueta})`);
  return body;
}

// ── Claves ─────────────────────────────────────────────────────────

export const KEY_ADMIN = "adminconfig";
export const KEY_TARIFARIO = "tarifario";
/** Transporte AAA — tarifario de costo a contratistas (uso interno). */
export const KEY_TARIFARIO_COSTO = "tarifario_costo";
export const monthStorageKey = (monthKey: string) => `services:${monthKey}`;

/** Peso de un mes en caracteres de JSON y MB, con banderas de aviso/bloqueo. */
export function monthSizeInfo(items: Servicio[]): { chars: number; mb: number; warn: boolean; block: boolean } {
  const chars = JSON.stringify(items).length;
  return {
    chars,
    mb: chars / 1048576,
    warn: chars > SAVE_WARN_CHARS,
    block: SAVE_BLOCK_CHARS > 0 && chars > SAVE_BLOCK_CHARS,
  };
}


export interface SaveMonthOptions {
  /**
   * Se llama cuando el mes supera el umbral de aviso (8 MB). Recibe los MB con
   * 1 decimal; devolver false cancela el guardado (se lanza Error 'cancelado').
   * Por defecto se guarda sin preguntar (el hook pasa window.confirm).
   */
  onWarn?: (mb: string) => boolean;
}

/** Nombre de archivo del backup: backup_control_aaa_AAAA-MM-DD_HHMM.json */
export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `backup_control_aaa_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/**
 * Prevalidación de un payload de backup ANTES de restaurar: devuelve el
 * backup tipado, el número de bloques y la fecha de generación legible
 * (es-CO; 'fecha desconocida' si falta), o un error con el mensaje del panel.
 * Única fuente de esta validación — las vistas NO deben duplicarla.
 */
export function validateBackup(
  payload: unknown,
): { ok: true; backup: Backup; blocks: number; fecha: string } | { ok: false; error: string } {
  const p = payload as Partial<Backup> | null;
  if (!p || p.app !== "control_contrato_aaa" || typeof p.keys !== "object" || p.keys === null) {
    return { ok: false, error: "El archivo no es una copia de seguridad válida del panel (app ≠ control_contrato_aaa)." };
  }
  const fecha = p.generatedAt ? new Date(p.generatedAt).toLocaleString("es-CO") : "fecha desconocida";
  return { ok: true, backup: p as Backup, blocks: Object.keys(p.keys).length, fecha };
}

// ── Storage de un módulo ───────────────────────────────────────────
// Cada módulo (Transporte AAA, Contrato de Alquiler) tiene su propio espacio
// de datos en transporte_kv y NUNCA se mezclan: el prefijo queda fijo al crear
// el storage, así una operación en curso no puede escribir en otro módulo
// aunque el usuario cambie de página a mitad del guardado.
export function storageFor(ns: ModuloNs) {
  const NS_PREFIX = prefijoDe(ns);
  const nsKey = (key: string) => `${NS_PREFIX}${key}`;

  // ── Contrato get/set/delete/list (valores string JSON) ─────────────

  async function kvGet(key: string): Promise<string | null> {
    const k = nsKey(key);
    if (!storageAvailable()) return demoStore.get(k) ?? null;
    const r = await api<{ key: string; value: string | null }>(`${API}?key=${encodeURIComponent(k)}`, undefined, `get ${key}`);
    return r.value;
  }

  async function kvSet(key: string, value: string, timeoutMs = STORAGE_TIMEOUT_MS): Promise<void> {
    const k = nsKey(key);
    if (!storageAvailable()) { demoStore.set(k, value); return; }
    await api(`${API}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: k, value }),
    }, `set ${key}`, timeoutMs);
  }

  async function kvDelete(key: string): Promise<void> {
    const k = nsKey(key);
    if (!storageAvailable()) { demoStore.delete(k); return; }
    await api(`${API}?key=${encodeURIComponent(k)}`, { method: "DELETE" }, `delete ${key}`);
  }

  /** Fecha de actualización por clave (solo las de este módulo, sin prefijo). Sirve para recargar solo lo que cambió. */
  async function kvMeta(): Promise<Record<string, string>> {
    if (!storageAvailable()) return Object.fromEntries([...demoStore.keys()].map((k) => [k, ""]));
    const r = await api<{ keys: string[]; updated?: Record<string, string> }>(`${API}?list=1`, undefined, "meta");
    const out: Record<string, string> = {};
    Object.entries(r.updated ?? {}).forEach(([k, v]) => {
      if (NS_PREFIX ? k.startsWith(NS_PREFIX) : !/^[a-z0-9-]+:(adminconfig|tarifario|services:)/.test(k)) out[NS_PREFIX ? k.slice(NS_PREFIX.length) : k] = v;
    });
    return out;
  }

  async function kvList(): Promise<string[]> {
    // Solo las claves de ESTE módulo, sin su prefijo (Transporte excluye las de otros módulos)
    const propias = (keys: string[]) => keys
      .filter((k) => (NS_PREFIX ? k.startsWith(NS_PREFIX) : !/^[a-z0-9-]+:(adminconfig|tarifario|services:)/.test(k)))
      .map((k) => (NS_PREFIX ? k.slice(NS_PREFIX.length) : k));
    if (!storageAvailable()) return propias([...demoStore.keys()]);
    const r = await api<{ keys: string[] }>(`${API}?list=1`, undefined, "list");
    return propias(r.keys);
  }

  // ── Meses ──────────────────────────────────────────────────────────

  /** Carga el arreglo de servicios de un mes ('AAAA-MM'); [] si no existe o es inválido. */
  async function loadMonth(monthKey: string): Promise<Servicio[]> {
    const raw = await kvGet(monthStorageKey(monthKey));
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? (arr as Servicio[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Guarda el arreglo del mes con verificación de límites de peso:
   * bloqueo > SAVE_BLOCK_CHARS (~20 MB) y aviso confirmable > SAVE_WARN_CHARS (~8 MB).
   */
  async function saveMonth(monthKey: string, items: Servicio[], opts: SaveMonthOptions = {}): Promise<void> {
    const size = monthSizeInfo(items);
    if (size.block) {
      throw new Error(
        `El mes ${monthKey} supera el límite de ${(SAVE_BLOCK_CHARS / 1048576).toFixed(0)} MB en adjuntos y no se puede guardar. Elimina o reduce archivos adjuntos.`,
      );
    }
    if (size.warn && opts.onWarn) {
      const ok = opts.onWarn(size.mb.toFixed(1));
      if (!ok) throw new Error("Guardado cancelado por el usuario (mes demasiado pesado).");
    }
    await kvSet(monthStorageKey(monthKey), JSON.stringify(items));
  }

  // ── adminconfig / tarifario ────────────────────────────────────────

  async function loadAdminRaw(): Promise<AdminConfig | null> {
    const raw = await kvGet(KEY_ADMIN);
    if (!raw) return null;
    try {
      return normalizeAdmin(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async function saveAdmin(admin: AdminConfig): Promise<void> {
    await kvSet(KEY_ADMIN, JSON.stringify(admin));
  }

  async function loadTarifario(): Promise<Tarifario | null> {
    const raw = await kvGet(KEY_TARIFARIO);
    if (!raw) return null;
    try {
      const t = JSON.parse(raw) as Tarifario;
      return t && Array.isArray(t.categorias) ? t : null;
    } catch {
      return null;
    }
  }

  async function saveTarifario(t: Tarifario): Promise<void> {
    await kvSet(KEY_TARIFARIO, JSON.stringify(t));
  }

  /** Tarifario de costo a contratistas (solo Transporte AAA); si no existe se siembra el del Formato 2. */
  async function loadTarifarioCostoOrSeed(): Promise<Tarifario | null> {
    if (ns !== "transporte") return null;
    const raw = await kvGet(KEY_TARIFARIO_COSTO);
    try {
      const t = raw ? (JSON.parse(raw) as Tarifario) : null;
      if (t && Array.isArray(t.categorias)) return t;
    } catch { /* se siembra de nuevo */ }
    const d = JSON.parse(JSON.stringify(TARIFARIO_COSTO_DEFAULT)) as Tarifario;
    await kvSet(KEY_TARIFARIO_COSTO, JSON.stringify(d)).catch(() => undefined);
    return d;
  }

  async function saveTarifarioCosto(t: Tarifario): Promise<void> {
    await kvSet(KEY_TARIFARIO_COSTO, JSON.stringify(t));
  }

  /**
   * Carga el tarifario y, si no existe, escribe y devuelve el del módulo.
   * Alquiler / Emergencia: si quedó sembrado con el de Transporte AAA (versiones
   * anteriores), se reemplaza por el propio del módulo.
   */
  async function loadTarifarioOrSeed(): Promise<Tarifario> {
    const t = await loadTarifario();
    // Tarifario de Transporte AAA sembrado por error en otro módulo → se reemplaza por el propio.
    const ajeno = !!t && (ns === "alquiler"
      ? !t.categorias.some((c) => /alquiler/i.test(c.label))
      : ns === "emergencia" ? (t.categorias.length === 0 || t.categorias.some((c) => /^cat\d+$/.test(c.id)))
      // Contrato creado en la app: nunca hereda el tarifario de Transporte AAA.
      : ns !== "transporte" && t.categorias.some((c) => /^cat\d+$/.test(c.id)));
    if (t && !ajeno) return t;
    const d = tarifarioDefaultDe(ns);
    await saveTarifario(d).catch(() => undefined);
    return d;
  }

  // ── Backup / restore (formato del SPEC §2.4) ───────────────────────

  /** Construye el payload de backup: adminconfig + tarifario + todos los services:*. */
  async function buildBackup(months: MonthInfo[]): Promise<Backup> {
    const wanted = new Set<string>([KEY_ADMIN, KEY_TARIFARIO, ...(ns === "transporte" ? [KEY_TARIFARIO_COSTO] : []), ...months.map((m) => monthStorageKey(m.key))]);
    const listed = await kvList().catch(() => [] as string[]);
    listed.forEach((k) => {
      if (k === KEY_ADMIN || k === KEY_TARIFARIO || k.startsWith("services:")) wanted.add(k);
    });
    const keys: Record<string, string> = {};
    for (const k of wanted) {
      const v = await kvGet(k);
      if (v !== null) keys[k] = v;
    }
    return { app: "control_contrato_aaa", version: 1, generatedAt: new Date().toISOString(), keys };
  }

  /** Restaura todas las claves del backup (SOBRESCRIBE; timeout 20 s por clave). */
  async function restoreBackup(backup: Backup): Promise<void> {
    for (const [k, v] of Object.entries(backup.keys)) {
      await kvSet(k, v, RESTORE_TIMEOUT_MS);
    }
  }

  return { kvGet, kvSet, kvDelete, kvMeta, kvList, loadMonth, saveMonth, loadAdminRaw, saveAdmin, loadTarifario, saveTarifario, loadTarifarioOrSeed, loadTarifarioCostoOrSeed, saveTarifarioCosto, buildBackup, restoreBackup };
}
export type ModuloStorage = ReturnType<typeof storageFor>;
