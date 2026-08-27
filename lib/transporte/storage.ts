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
  TARIFARIO_DEFAULT,
} from "./constants";
import type { AdminConfig, Backup, MonthInfo, Servicio, Tarifario } from "./model";
import { normalizeAdmin } from "./constants";

const API = "/api/aaa/transporte";

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

// ── Contrato get/set/delete/list (valores string JSON) ─────────────

export async function kvGet(key: string): Promise<string | null> {
  if (!storageAvailable()) return demoStore.get(key) ?? null;
  const r = await api<{ key: string; value: string | null }>(`${API}?key=${encodeURIComponent(key)}`, undefined, `get ${key}`);
  return r.value;
}

export async function kvSet(key: string, value: string, timeoutMs = STORAGE_TIMEOUT_MS): Promise<void> {
  if (!storageAvailable()) { demoStore.set(key, value); return; }
  await api(`${API}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }, `set ${key}`, timeoutMs);
}

export async function kvDelete(key: string): Promise<void> {
  if (!storageAvailable()) { demoStore.delete(key); return; }
  await api(`${API}?key=${encodeURIComponent(key)}`, { method: "DELETE" }, `delete ${key}`);
}

export async function kvList(): Promise<string[]> {
  if (!storageAvailable()) return [...demoStore.keys()];
  const r = await api<{ keys: string[] }>(`${API}?list=1`, undefined, "list");
  return r.keys;
}

// ── Claves ─────────────────────────────────────────────────────────

export const KEY_ADMIN = "adminconfig";
export const KEY_TARIFARIO = "tarifario";
export const monthStorageKey = (monthKey: string) => `services:${monthKey}`;

// ── Meses ──────────────────────────────────────────────────────────

/** Carga el arreglo de servicios de un mes ('AAAA-MM'); [] si no existe o es inválido. */
export async function loadMonth(monthKey: string): Promise<Servicio[]> {
  const raw = await kvGet(monthStorageKey(monthKey));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Servicio[]) : [];
  } catch {
    return [];
  }
}

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

/**
 * Guarda el arreglo del mes con verificación de límites de peso:
 * bloqueo > SAVE_BLOCK_CHARS (~20 MB) y aviso confirmable > SAVE_WARN_CHARS (~8 MB).
 */
export async function saveMonth(monthKey: string, items: Servicio[], opts: SaveMonthOptions = {}): Promise<void> {
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

export async function loadAdminRaw(): Promise<AdminConfig | null> {
  const raw = await kvGet(KEY_ADMIN);
  if (!raw) return null;
  try {
    return normalizeAdmin(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveAdmin(admin: AdminConfig): Promise<void> {
  await kvSet(KEY_ADMIN, JSON.stringify(admin));
}

export async function loadTarifario(): Promise<Tarifario | null> {
  const raw = await kvGet(KEY_TARIFARIO);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Tarifario;
    return t && Array.isArray(t.categorias) ? t : null;
  } catch {
    return null;
  }
}

export async function saveTarifario(t: Tarifario): Promise<void> {
  await kvSet(KEY_TARIFARIO, JSON.stringify(t));
}

/** Carga el tarifario y, si no existe, escribe y devuelve el default (como el init original). */
export async function loadTarifarioOrSeed(): Promise<Tarifario> {
  const t = await loadTarifario();
  if (t) return t;
  await saveTarifario(TARIFARIO_DEFAULT).catch(() => undefined);
  return TARIFARIO_DEFAULT;
}

// ── Backup / restore (formato del SPEC §2.4) ───────────────────────

/** Construye el payload de backup: adminconfig + tarifario + todos los services:*. */
export async function buildBackup(months: MonthInfo[]): Promise<Backup> {
  const wanted = new Set<string>([KEY_ADMIN, KEY_TARIFARIO, ...months.map((m) => monthStorageKey(m.key))]);
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

/** Restaura todas las claves del backup (SOBRESCRIBE; timeout 20 s por clave). */
export async function restoreBackup(backup: Backup): Promise<void> {
  for (const [k, v] of Object.entries(backup.keys)) {
    await kvSet(k, v, RESTORE_TIMEOUT_MS);
  }
}
