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
export const POLL_INTERVAL_MS = 20_000; // sondeo ligero (solo metadatos); se descarga solo lo que cambió

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

// ── Contrato de Alquiler (Grupo 1) ─────────────────────────────────
// Fuente: contrato de prestación de servicios CW2236995 firmado, acta de
// inicio N° 2026-003 y «A.1.2 Formulario de Cantidades y Precios Contractuales»
// (oferta de AG, hoja GRUPO 1). Datos propios del módulo: nunca se mezclan
// con los de Transporte AAA.

export const CONTRATO_ALQUILER = {
  numero: "2026-003",
  objeto: "Servicio de alquiler de equipos y/o maquinaria pesada a todo costo (Grupo 1)",
  modalidad: "Invitación abierta a ofertar IAO No. 29-2025",
  /** Cláusula Tercera: hasta $4.126.025.908, IVA incluido. */
  valor: 4126025908,
  /** Acta de inicio: 12 meses o hasta agotar el valor, lo primero que ocurra. */
  inicio: "2026-02-02",
  fin: "2027-02-02",
};

/** Precios unitarios contractuales sin IVA (acta de inicio / formulario de precios). */
export const TARIFARIO_ALQUILER_DEFAULT: Tarifario = {
  recargos: { nocturno: 0, dominicalFestivo: 0 },
  categorias: [
    {
      id: "alq1",
      label: "Ítem 1 · Servicio de Alquiler de Excavadora 22 m",
      capacidad: "",
      rutas: [
        { id: "1.1", label: "Barranquilla y su área metropolitana (HR)", unitario: 344500 },
        { id: "1.2", label: "Municipios (HR)", unitario: 370500 },
        { id: "1.3", label: "Transporte del equipo · Barranquilla y su área metropolitana", unitario: 1470000 },
        { id: "1.4", label: "Transporte del equipo · Municipios", unitario: 1715000 },
      ],
    }, // sobre oruga, alcance mín. 22 m, cucharón 0,9 m³
    {
      id: "alq2",
      label: "Ítem 2 · Servicio de Alquiler de Excavadora 19 t",
      capacidad: "",
      rutas: [
        { id: "2.1", label: "Barranquilla y su área metropolitana (HR)", unitario: 344500 },
        { id: "2.2", label: "Municipios (HR)", unitario: 370500 },
        { id: "2.3", label: "Transporte del equipo · Barranquilla y su área metropolitana", unitario: 1470000 },
        { id: "2.4", label: "Transporte del equipo · Municipios", unitario: 1715000 },
      ],
    }, // sobre oruga, peso mín. 19 t, excavación mín. 6 m, cucharón 0,9 m³
    {
      id: "alq3",
      label: "Ítem 3 · Servicio de Alquiler de Bulldozer",
      capacidad: "",
      rutas: [
        { id: "3.1", label: "Barranquilla y su área metropolitana (HR)", unitario: 264000 },
        { id: "3.2", label: "Municipios (HR)", unitario: 234000 },
        { id: "3.3", label: "Transporte del equipo · Barranquilla y su área metropolitana", unitario: 1470000 },
        { id: "3.4", label: "Transporte del equipo · Municipios", unitario: 1715000 },
      ],
    }, // tractor topador sobre oruga, peso mín. 22 t, hoja 5 m³
    {
      id: "alq4",
      label: "Ítem 4 · Servicio de Alquiler de Cargador",
      capacidad: "",
      rutas: [
        { id: "4.1", label: "Barranquilla y su área metropolitana (HR)", unitario: 206250 },
        { id: "4.2", label: "Municipios (HR)", unitario: 218750 },
        { id: "4.3", label: "Transporte del equipo · Barranquilla y su área metropolitana", unitario: 1470000 },
        { id: "4.4", label: "Transporte del equipo · Municipios", unitario: 1715000 },
      ],
    }, // pala frontal sobre ruedas, peso mín. 12 t, cucharón 2,2 m³
    {
      id: "alq5",
      label: "Ítem 5 · Servicio de Alquiler de Mini cargador",
      capacidad: "",
      rutas: [
        { id: "5.1", label: "Barranquilla y su área metropolitana (HR)", unitario: 81250 },
        { id: "5.2", label: "Municipios (HR)", unitario: 93750 },
        { id: "5.3", label: "Transporte del equipo · Barranquilla y su área metropolitana", unitario: 676200 },
        { id: "5.4", label: "Transporte del equipo · Municipios", unitario: 882000 },
      ],
    }, // frontal sobre ruedas, balde mín. 0,4 m³
    {
      id: "alq6",
      label: "Ítem 6 · Servicio de Alquiler de Retroexcavadora pajarita",
      capacidad: "",
      rutas: [
        { id: "6.1", label: "Barranquilla y su área metropolitana (HR)", unitario: 181250 },
        { id: "6.2", label: "Municipios (HR)", unitario: 200000 },
        { id: "6.3", label: "Transporte del equipo · Barranquilla y su área metropolitana", unitario: 676200 },
        { id: "6.4", label: "Transporte del equipo · Municipios", unitario: 882000 },
      ],
    }, // cargadora sobre ruedas, excavación mín. 4 m, 10.500 kg, cucharón 0,8 m³
    {
      id: "alq7",
      label: "Ítem 7 · Servicio de Alquiler de Mini excavadora",
      capacidad: "",
      rutas: [
        { id: "7.1", label: "Barranquilla y su área metropolitana (HR)", unitario: 230000 },
        { id: "7.2", label: "Municipios (HR)", unitario: 276000 },
        { id: "7.3", label: "Transporte del equipo · Barranquilla y su área metropolitana", unitario: 676200 },
        { id: "7.4", label: "Transporte del equipo · Municipios", unitario: 882000 },
      ],
    }, // sobre oruga, peso mín. 3,5 t, excavación mín. 3,1 m
  ],
};

// ── Tarifario por defecto (§1.3) ───────────────────────────────────
// Valores del «FORMATO 2 — Formulario de cantidades y precios» (sep 2026).

export const TARIFARIO_DEFAULT: Tarifario = {
  recargos: { nocturno: 109600, dominicalFestivo: 126905 },
  categorias: [
    {
      id: "cat1",
      label: "Ítem 1 · Camión Plancha 5 Ton (largo mín. 5 m)",
      capacidad: 5,
      rutas: [
        { id: "1.1", label: "Barranquilla a su Área Metropolitana", unitario: 703199 },
        { id: "1.2", label: "Barranquilla a Municipios Costero", unitario: 920042 },
        { id: "1.3", label: "Barranquilla a Municipios Oriente", unitario: 989095 },
        { id: "1.4", label: "Transporte entre Municipios", unitario: 989095 },
      ],
    },
    {
      id: "cat2",
      label: "Ítem 2 · Camión Plancha 8 Ton (largo mín. 6 m)",
      capacidad: 8,
      rutas: [
        { id: "2.1", label: "Barranquilla a su Área Metropolitana", unitario: 706199 },
        { id: "2.2", label: "Barranquilla a Municipios Costero", unitario: 922042 },
        { id: "2.3", label: "Barranquilla a Municipios Oriente", unitario: 991095 },
        { id: "2.4", label: "Transporte entre Municipios", unitario: 991095 },
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
        { id: "4.1", label: "Barranquilla a su Área Metropolitana", unitario: 1541236 },
        { id: "4.2", label: "Barranquilla a Municipios Costero", unitario: 1798192 },
        { id: "4.3", label: "Barranquilla a Municipios Oriente", unitario: 1978561 },
        { id: "4.4", label: "Transporte entre Municipios (ref. servicio a demanda)", unitario: 1978561 },
      ],
    },
  ],
};

// ── Costo a contratistas (Transporte AAA) — USO INTERNO ────────────
// «Formato 2 IS-04-2026 — Tarifas pago contratista»: valor NETO por viaje que
// AG paga al contratista, con las mismas categorías y rutas del tarifario de
// venta. Recargo nocturno y dominical/festivo: $50.000 c/u en todas las zonas.
// Nunca va en PDF ni exportaciones: es información interna para gerencia.

/** Costo neto por viaje según categoría/ruta (ids iguales a TARIFARIO_DEFAULT). */
const COSTO_RUTA: Record<string, number> = {
  "1.1": 300000,
  "1.2": 450000,
  "1.3": 450000,
  "1.4": 450000,
  "2.1": 450000,
  "2.2": 550000,
  "2.3": 550000,
  "2.4": 550000,
  "3.1": 850000,
  "3.2": 1100000,
  "3.3": 1250000,
  "3.4": 1250000,
  "4.1": 1100000,
  "4.2": 1100000,
  "4.3": 1250000,
  "4.4": 1250000,
};
export const TARIFARIO_COSTO_DEFAULT: Tarifario = {
  recargos: { nocturno: 50000, dominicalFestivo: 50000 },
  categorias: TARIFARIO_DEFAULT.categorias.map((c) => ({
    ...c,
    rutas: c.rutas.map((r) => ({ ...r, unitario: COSTO_RUTA[r.id] ?? 0 })),
  })),
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

// ── Otro Sí / Emergencia ───────────────────────────────────────────
// Fuente: contrato de prestación de servicios N° 2026-060 firmado el
// 21/05/2026 (contratación directa por situación de emergencia). CW2238311 es
// el código del documento en Adobe Sign, no el número del contrato.
// Datos propios del módulo: nunca se mezclan con Alquiler ni Transporte AAA.

export const CONTRATO_EMERGENCIA = {
  numero: "2026-060",
  objeto: "Servicio de transporte de residuos especiales no peligrosos, sólidos ordinarios no aprovechables",
  modalidad: "Contratación directa (situación de emergencia)",
  /** Cláusula Tercera: hasta $5.726.101.096, IVA incluido. */
  valor: 5726101096,
  /** Valor que se usó antes (presupuesto del corte de subgerencia); se corrige una vez. */
  valorCorte: 5726100960,
  /** Suscripción (firma de ambas partes) — Cláusula Segunda: hasta el 29/10/2026 o hasta agotar el valor. */
  inicio: "2026-05-21",
  fin: "2026-10-29",
  /** Cláusula Cuarta: alcance por área solicitante (servicio a todo costo con volquetas). */
  alcance: [
    { area: "Business Partner de Aseo", servicio: "Transporte de residuos no peligrosos (volquetas doble troque y sencillas)", cantidad: 9158, unidad: "horas" },
    { area: "Jefatura de Operaciones", servicio: "Transporte de residuos sólidos ordinarios no aprovechables", cantidad: 3212, unidad: "horas" },
    { area: "Dirección de proyectos de operación", servicio: "Transporte de residuos no peligrosos (volquetas doble troque)", cantidad: 20520, unidad: "m³" },
    { area: "Disposición Final", servicio: "Transporte de RCD (volquetas doble troque)", cantidad: 7920, unidad: "horas" },
  ],
};

/**
 * Tarifas por hora de volqueta según la conciliación de volquetas (grupos GP):
 * la conciliación las da con IVA; aquí se guardan SIN IVA (÷ 1,19) y el IVA 19%
 * se suma aparte en cada registro, como en Contrato de Alquiler.
 */
const sinIva = (conIva: number) => Math.round((conIva / 1.19) * 100) / 100;
export const TARIFAS_GP_EMERGENCIA: Record<string, { zona: string; conIva: number; sencilla?: boolean }> = {
  GP1: { zona: "Barranquilla", conIva: 239164 },
  GP1P: { zona: "Barranquilla con peaje", conIva: 279665 },
  GP4: { zona: "Barranquilla con peaje puerto", conIva: 352446 },
  GP2: { zona: "Ponedera", conIva: 314127 },
  GP3: { zona: "Sabanalarga", conIva: 279665 },
  GP1S: { zona: "Barranquilla", conIva: 201433.68, sencilla: true },
};
export const TARIFARIO_EMERGENCIA_DEFAULT: Tarifario = {
  recargos: { nocturno: 0, dominicalFestivo: 0 },
  categorias: [
    {
      id: "vqdt",
      label: "Ítem 1 · Servicio de Volqueta doble troque",
      capacidad: 14,
      rutas: Object.entries(TARIFAS_GP_EMERGENCIA).filter(([, v]) => !v.sencilla)
        .map(([gp, v]) => ({ id: gp, label: `${v.zona} (HR)`, unitario: sinIva(v.conIva) })),
    },
    {
      id: "vqs",
      label: "Ítem 2 · Servicio de Volqueta sencilla",
      capacidad: 8,
      rutas: Object.entries(TARIFAS_GP_EMERGENCIA).filter(([, v]) => v.sencilla)
        .map(([gp, v]) => ({ id: gp, label: `${v.zona} (HR)`, unitario: sinIva(v.conIva) })),
    },
  ],
};
/** Zonas (centros de costo) del servicio de emergencia: B2B y B2G. */
export const ZONAS_EMERGENCIA = ["B2B", "B2G"];

/** Módulos del motor de registros (cada uno con su espacio de datos en transporte_kv). */
export type ModuloContrato = "transporte" | "alquiler" | "emergencia";

/** Ficha de cada módulo: nombre, contrato y prefijo de órdenes. */
export const FICHA_MODULO: Record<ModuloContrato, {
  nombre: string;
  numero: string;
  objeto: string;
  prefijoOrden: string;
  /** Módulo de registros (Alquiler / Emergencia): el ejecutado es la suma de los registros. */
  registros: boolean;
  /** El valor del contrato incluye IVA. */
  ivaIncluido: boolean;
  /** Datos del contrato firmado que se aplican al admin si aún no tiene valor (Transporte usa los suyos). */
  contrato: { valor: number; inicio: string; fin: string } | null;
}> = {
  transporte: { nombre: "Transporte AAA", numero: "IS No. 04-2026", objeto: "Transporte de equipos y maquinaria propia", prefijoOrden: "TP", registros: false, ivaIncluido: false, contrato: null },
  alquiler: { nombre: "Contrato de Alquiler", numero: `N° ${CONTRATO_ALQUILER.numero}`, objeto: CONTRATO_ALQUILER.objeto, prefijoOrden: "AL", registros: true, ivaIncluido: true, contrato: CONTRATO_ALQUILER },
  emergencia: { nombre: "Otro Sí / Emergencia", numero: `N° ${CONTRATO_EMERGENCIA.numero}`, objeto: CONTRATO_EMERGENCIA.objeto, prefijoOrden: "EM", registros: true, ivaIncluido: true, contrato: CONTRATO_EMERGENCIA },
};

/** Tarifario inicial de cada módulo (cada uno con el suyo). */
export function tarifarioDefaultDe(ns: ModuloContrato): Tarifario {
  const t = ns === "alquiler" ? TARIFARIO_ALQUILER_DEFAULT : ns === "emergencia" ? TARIFARIO_EMERGENCIA_DEFAULT : TARIFARIO_DEFAULT;
  return JSON.parse(JSON.stringify(t)) as Tarifario;
}
