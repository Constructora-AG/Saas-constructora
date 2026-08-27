// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Constantes del contrato, festivos, seeds
// Valores literales del panel original (docs/transporte-aaa/SPEC.md §1, §3.4).
// ════════════════════════════════════════════════════════════════════

import type {
  AdminConfig,
  Equipo,
  FestivoCustom,
  PermKey,
  PersonalItem,
  Tarifario,
  Vehiculo,
} from "./model";

// ── Backend / límites de guardado ──────────────────────────────────
// La persistencia es Supabase (tabla clave-valor transporte_kv) vía
// /api/aaa/transporte. Los límites de peso del panel original se conservan
// como salvaguarda configurable: aviso a los 8 MB por mes y bloqueo a los
// 20 MB (Supabase no impone ese tope; se mantiene para evitar meses
// inmanejables por adjuntos — ajustable aquí).

/** Caracteres de JSON.stringify(servicios del mes) que disparan el aviso (~8 MB). */
export const SAVE_WARN_CHARS = 8_000_000;
/** Caracteres que bloquean el guardado del mes (~20 MB). Ajustable. */
export const SAVE_BLOCK_CHARS = 20_000_000;
/** Tamaño máximo de un archivo adjunto individual (20 MB). */
export const FILE_MAX_BYTES = 20 * 1024 * 1024;
/** Umbral de recomendación para PDFs adjuntos (3 MB): se avisa pero se adjunta. */
export const PDF_WARN_BYTES = 3 * 1024 * 1024;
/** Timeout genérico de las llamadas de storage (ms); 20 s al restaurar backup. */
export const STORAGE_TIMEOUT_MS = 15_000;
export const RESTORE_TIMEOUT_MS = 20_000;
/** Intervalo del polling de sincronización (ms). */
export const POLL_INTERVAL_MS = 12_000;

// ── Contrato ───────────────────────────────────────────────────────

export const CONTRACT_VALUE = 2891433496; // COP, IVA excluido
export const CONTRACT_MONTHS = 14;        // respaldo si no hay fecha fin
export const CONTRACT_START_DEFAULT = "2026-07-01";
export const CONTRACT_END_DEFAULT = "2027-08-31"; // inclusiva

export const CONTRACT_EYEBROW = "Contrato de Prestación de Servicios · IS No. 04-2026";
export const CONTRACT_TITLE = "Transporte de Equipos y Maquinaria — Triple A / Anaya Giraldo";
export const CONTRATANTE = "Triple A de B/Q S.A. E.S.P.";
export const CONTRATISTA = "Constructora Anaya Giraldo S.A.S.";
export const CONTRATISTA_NIT = "900.530.150-5";

// ── Tarifario por defecto (§1.3) ───────────────────────────────────

export const TARIFARIO_DEFAULT: Tarifario = {
  recargos: { nocturno: 109600, dominicalFestivo: 126905 },
  categorias: [
    {
      id: "cat1",
      label: "Ítem 1 · Camión Plancha 5 Ton (largo mín. 5 m)",
      capacidad: 5,
      rutas: [
        { id: "1.1", label: "Barranquilla a su Área Metropolitana", unitario: 709199 },
        { id: "1.2", label: "Barranquilla a Municipios Costero", unitario: 925042 },
        { id: "1.3", label: "Barranquilla a Municipios Oriente", unitario: 994095 },
        { id: "1.4", label: "Transporte entre Municipios", unitario: 994095 },
      ],
    },
    {
      id: "cat2",
      label: "Ítem 2 · Camión Plancha 8 Ton (largo mín. 6 m)",
      capacidad: 8,
      rutas: [
        { id: "2.1", label: "Barranquilla a su Área Metropolitana", unitario: 709199 },
        { id: "2.2", label: "Barranquilla a Municipios Costero", unitario: 925042 },
        { id: "2.3", label: "Barranquilla a Municipios Oriente", unitario: 994095 },
        { id: "2.4", label: "Transporte entre Municipios", unitario: 994095 },
      ],
    },
    {
      id: "cat3",
      label: "Ítem 3 · Camión Plancha 20 Ton (largo mín. 8 m)",
      capacidad: 20,
      rutas: [
        { id: "3.1", label: "Barranquilla a su Área Metropolitana", unitario: 1541736 },
        { id: "3.2", label: "Barranquilla a Municipios Costero", unitario: 1798692 },
        { id: "3.3", label: "Barranquilla a Municipios Oriente (ref. servicio a demanda)", unitario: 1978561 },
        { id: "3.4", label: "Transporte entre Municipios (ref. servicio a demanda)", unitario: 1978561 },
      ],
    },
    {
      id: "cat4",
      label: "Ítem 4 · Cama Baja 40 Ton (largo mín. 11 m)",
      capacidad: 40,
      rutas: [
        { id: "4.1", label: "Barranquilla a su Área Metropolitana", unitario: 1541736 },
        { id: "4.2", label: "Barranquilla a Municipios Costero", unitario: 1798692 },
        { id: "4.3", label: "Barranquilla a Municipios Oriente", unitario: 1978561 },
        { id: "4.4", label: "Transporte entre Municipios (ref. servicio a demanda)", unitario: 1978561 },
      ],
    },
  ],
};

// ── Festivos Ley Emiliani (21 fechas, no editables — §1.4) ─────────

export const FESTIVOS_DEFAULT: FestivoCustom[] = [
  { date: "2026-07-20", label: "Día de la Independencia" },
  { date: "2026-08-07", label: "Batalla de Boyacá" },
  { date: "2026-08-17", label: "Asunción de la Virgen (trasladado)" },
  { date: "2026-10-12", label: "Día de la Raza" },
  { date: "2026-11-02", label: "Todos los Santos (trasladado)" },
  { date: "2026-11-16", label: "Independencia de Cartagena (trasladado)" },
  { date: "2026-12-08", label: "Inmaculada Concepción" },
  { date: "2026-12-25", label: "Navidad" },
  { date: "2027-01-01", label: "Año Nuevo" },
  { date: "2027-01-11", label: "Reyes Magos (trasladado)" },
  { date: "2027-03-22", label: "San José (trasladado)" },
  { date: "2027-03-25", label: "Jueves Santo" },
  { date: "2027-03-26", label: "Viernes Santo" },
  { date: "2027-05-01", label: "Día del Trabajo" },
  { date: "2027-05-10", label: "Ascensión del Señor (trasladado)" },
  { date: "2027-05-31", label: "Corpus Christi (trasladado)" },
  { date: "2027-06-07", label: "Sagrado Corazón (trasladado)" },
  { date: "2027-07-05", label: "San Pedro y San Pablo (trasladado)" },
  { date: "2027-07-20", label: "Día de la Independencia" },
  { date: "2027-08-07", label: "Batalla de Boyacá" },
  { date: "2027-08-16", label: "Asunción de la Virgen (trasladado)" },
];

/** Festivos oficiales + personalizados del admin. */
export function allFestivos(admin: Pick<AdminConfig, "festivosCustom"> | null): FestivoCustom[] {
  return [...FESTIVOS_DEFAULT, ...(admin?.festivosCustom ?? [])];
}

// ── Permisos ───────────────────────────────────────────────────────

export const PERM_KEYS: PermKey[] = ["interventores", "areas", "vehiculos", "equipos", "festivos", "personal"];

export const PERM_LABELS: Record<PermKey, string> = {
  interventores: "Interventores",
  areas: "Áreas AAA",
  vehiculos: "Vehículos",
  equipos: "Equipos",
  festivos: "Festivos",
  personal: "Personal",
};

function permsFalse(): Record<PermKey, boolean> {
  return { interventores: false, areas: false, vehiculos: false, equipos: false, festivos: false, personal: false };
}

// ── ADMIN por defecto ──────────────────────────────────────────────

export function adminDefault(): AdminConfig {
  return {
    profiles: {
      gerencia: { label: "Gerencia", password: "2952" },
      renzo: { label: "Renzo", password: "0610", perms: permsFalse() },
      jesus: { label: "Jesús", password: "4503", perms: permsFalse() },
    },
    interventores: [],
    areas: [],
    vehiculos: [],
    equipos: [],
    personal: [],
    festivosCustom: [],
    contractStart: CONTRACT_START_DEFAULT,
    contractEnd: CONTRACT_END_DEFAULT,
    backupLastAt: null,
    seedVersion: 0,
  };
}

/** Mezcla sobre el default y garantiza los 3 perfiles con perms completos. */
export function normalizeAdmin(a: Partial<AdminConfig> | null | undefined): AdminConfig {
  const d = adminDefault();
  const merged: AdminConfig = { ...d, ...(a ?? {}) } as AdminConfig;
  merged.profiles = { ...d.profiles, ...(a?.profiles ?? {}) };
  (["renzo", "jesus"] as const).forEach((k) => {
    const p = merged.profiles[k] ?? d.profiles[k];
    merged.profiles[k] = { ...d.profiles[k], ...p, perms: { ...permsFalse(), ...(p.perms ?? {}) } };
  });
  merged.profiles.gerencia = { ...d.profiles.gerencia, ...(merged.profiles.gerencia ?? {}) };
  merged.interventores = Array.isArray(merged.interventores) ? merged.interventores : [];
  merged.areas = Array.isArray(merged.areas) ? merged.areas : [];
  merged.vehiculos = Array.isArray(merged.vehiculos) ? merged.vehiculos : [];
  merged.equipos = Array.isArray(merged.equipos) ? merged.equipos : [];
  merged.personal = Array.isArray(merged.personal) ? merged.personal : [];
  merged.festivosCustom = Array.isArray(merged.festivosCustom) ? merged.festivosCustom : [];
  return merged;
}

// ── Semillas (v1–v4, §3.4) ─────────────────────────────────────────

export const SEED_VERSION = 4;

const SEED_AREAS_V1: string[] = [
  "Subgerencia de Mantenimiento",
  "Gerencia de Aseo",
  "Subgerencia de Redes Acueducto",
  "Subgerencia de Redes Alcantarillado",
  "Subgerencia de Agua Potable",
  "Gerencia de Planeación",
];

const SEED_INTERVENTORES_V1: string[] = [
  "Camilo Lozano", "Jader Leyva", "Carlos Bayuelo", "Eva Delgado", "Rafael Peña", "Manuel Garcia",
  "Jorge Betancourt", "Luis Duque Duque", "Maria Jose Chois", "Blanca Avila", "Joaquin Escobar",
  "Juan Lyons", "Martin Mercado", "Amado Barrios", "Wilfredo Perez", "Horacio Caicedo",
  "Ivan Guerra", "Pablo Gonzales", "Astrid Mendoza", "Oscar Palacios", "Wendy Mendoza",
  "Ernesto Subero", "Claudio Vargas", "Maria Cristina", "Julian Aristizabal", "Alfonso Pareja Morales",
];

const SEED_VEHICULOS_V1: Vehiculo[] = [
  { plate: "LZR529", marca: "Foton (grúa planchón)", capacity: 5.9, driver: "Hernando Peña Urueta" },
  { plate: "GFP832", marca: "JAC (grúa)", capacity: 5.9, driver: "Fredis Ahumada Gonzalez" },
  { plate: "GQV140", marca: "JAC (grúa)", capacity: 5.9, driver: "Anthony Barraza Navarro" },
  { plate: "QUA001", marca: "Chevrolet NPR NA (grúa)", capacity: 3.5, driver: "Alfonso Antonio Guerrero Antonio" },
  { plate: "THY171", marca: "Internacional (Cama baja)", capacity: 35.0, driver: "Carlos Guerra Florian" },
  { plate: "UFJ947", marca: "Chevrolet Brigadier 151(Cama baja)", capacity: 35.0, driver: "Jean Paul Rodriguez Henao" },
];

const SEED_EQUIPOS_V2: Equipo[] = [
  { name: "Mini cargador Bobcat 570", clase: "Mini cargador", marca: "Bobcat", cantidad: 1, weight: 3.5, alto: 1.97, ancho: 1.64, largo: 2.65 },
  { name: "Mini excavadora 304", clase: "Mini excavadora", marca: "Caterpillar", cantidad: 1, weight: 4.02, alto: 2.5, ancho: 1.95, largo: 4.93 },
  { name: "Retro Excavadora 420E", clase: "Retro cargador", marca: "Caterpillar", cantidad: 2, weight: 8.38, alto: 3.57, ancho: 2.3, largo: 7.43 },
  { name: "Cargador Frontal", clase: "Cargador", marca: "Caterpillar", cantidad: 1, weight: 18.5, alto: 3.28, ancho: 3.28, largo: 3.28 },
  { name: "Tractor topador bulldozer", clase: "Topador Bulldozer", marca: "Caterpillar", cantidad: 1, weight: 22.5, alto: 3.66, ancho: 3.66, largo: 3.66 },
  { name: "Excavadora", clase: "Excavadora", marca: "Caterpillar", cantidad: 1, weight: 31, alto: 3.08, ancho: 2.99, largo: 9.8 },
];

const SEED_PASSWORDS_V3: Record<"gerencia" | "renzo" | "jesus", string> = {
  gerencia: "2952",
  renzo: "0610",
  jesus: "4503",
};

const SEED_FLOTA_V4: Record<string, { venceSoat: string | null; venceTecno: string | null; modelo: string }> = {
  LZR529: { venceSoat: "2027-04-16", venceTecno: "2027-04-15", modelo: "2023" },
  GFP832: { venceSoat: "2026-08-19", venceTecno: "2027-06-04", modelo: "2020" },
  GQV140: { venceSoat: "2027-03-07", venceTecno: "2027-03-13", modelo: "2021" },
  QUA001: { venceSoat: "2027-07-11", venceTecno: null, modelo: "1993" },
  THY171: { venceSoat: "2027-03-31", venceTecno: "2027-06-02", modelo: "2012" },
  UFJ947: { venceSoat: "2026-11-19", venceTecno: "2027-01-27", modelo: "1986" },
};

const SEED_PERSONAL_V4: Array<Pick<PersonalItem, "nombre" | "cedula">> = [
  { nombre: "Hernando Peña Urueta", cedula: "1143114867" },
  { nombre: "Fredis Ahumada Gonzalez", cedula: "1143140558" },
  { nombre: "Anthony Barraza Navarro", cedula: "1143156240" },
  { nombre: "Alfonso Antonio Guerrero Antonio", cedula: "9020267" },
  { nombre: "Carlos Guerra Florian", cedula: "" },
  { nombre: "Jean Paul Rodriguez Henao", cedula: "" },
];

/**
 * Aplica las semillas pendientes sobre `admin` (mutación in place, como el
 * original). Idempotente por `seedVersion`: lo borrado por el usuario NO se
 * repone porque cada bloque solo corre cuando su versión aún no fue aplicada.
 * Devuelve true si hubo cambios (y hay que re-guardar adminconfig).
 * Para futuras cargas: agregar bloque `if (from < 5) { … }` e incrementar SEED_VERSION.
 */
export function applySeed(admin: AdminConfig): boolean {
  const from = admin.seedVersion || 0;
  if (from >= SEED_VERSION) return false;

  if (from < 1) {
    // v1 — áreas, interventores, vehículos (dedup por valor / placa)
    SEED_AREAS_V1.forEach((a) => { if (!admin.areas.includes(a)) admin.areas.push(a); });
    SEED_INTERVENTORES_V1.forEach((i) => { if (!admin.interventores.includes(i)) admin.interventores.push(i); });
    SEED_VEHICULOS_V1.forEach((v) => {
      if (!admin.vehiculos.some((x) => x.plate === v.plate)) admin.vehiculos.push({ ...v });
    });
  }

  if (from < 2) {
    // v2 — equipos (dedup por name)
    SEED_EQUIPOS_V2.forEach((e) => {
      if (!admin.equipos.some((x) => x.name === e.name)) admin.equipos.push({ ...e });
    });
  }

  if (from < 3) {
    // v3 — claves definitivas (sobrescribe passwords)
    (Object.keys(SEED_PASSWORDS_V3) as Array<keyof typeof SEED_PASSWORDS_V3>).forEach((k) => {
      if (admin.profiles[k]) admin.profiles[k].password = SEED_PASSWORDS_V3[k];
    });
  }

  if (from < 4) {
    // v4 — ficha de flota por placa (solo rellena campos vacíos) + activo:true por defecto
    admin.vehiculos.forEach((v) => {
      const ficha = SEED_FLOTA_V4[v.plate];
      if (ficha) {
        if (v.venceSoat === undefined || v.venceSoat === null || v.venceSoat === "") v.venceSoat = ficha.venceSoat;
        if (v.venceTecno === undefined || v.venceTecno === null || v.venceTecno === "") v.venceTecno = ficha.venceTecno;
        if (v.modelo === undefined || v.modelo === null || v.modelo === "") v.modelo = ficha.modelo;
      }
      if (v.activo === undefined) v.activo = true;
    });
    // v4 — personal (dedup por nombre; activo:true, venceLicencia:null)
    SEED_PERSONAL_V4.forEach((p) => {
      if (!admin.personal.some((x) => x.nombre === p.nombre)) {
        admin.personal.push({ nombre: p.nombre, cedula: p.cedula, activo: true, venceLicencia: null });
      }
    });
  }

  admin.seedVersion = SEED_VERSION;
  return true;
}
