"use client";
// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Hook cliente central (estado + sincronización)
//
// API para las vistas (ver también "Contratos de la base (Cimiento)" en
// docs/transporte-aaa/UI-GUIA.md):
//
//   const t = useTransporte();
//   t.loading / t.error / t.demo / t.lastSyncAt / t.saving
//   t.admin, t.tarifario, t.months, t.servicesByMonth
//   t.activeMonthIdx, t.setActiveMonthIdx, t.activeMonth, t.activeServices
//   t.contractStart / t.contractEndExclusive / t.status (estado del contrato)
//   t.setModalOpen(true|false)      ← pausa el polling mientras haya modal
//   t.refresh()                     ← recarga manual (botón "Actualizar")
//   t.upsertService(monthKey, item) ← optimista + revert; verifica límites
//   t.deleteService(monthKey, id)
//   t.toggleInvoiced(monthKey, id)
//   t.markInvoiced(pares)           ← tras exportar
//   t.saveTarifarioCfg(t) / t.resetTarifario()
//   t.saveAdminCfg(mutator)         ← muta una copia del admin y persiste
//   t.downloadBackup() / t.restoreFromBackup(payload)
//
// Los servicios se guardan bajo 'services:AAAA-MM' como en el panel original;
// la persistencia es Supabase vía /api/aaa/transporte (lib/transporte/storage).
// ════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  POLL_INTERVAL_MS,
  TARIFARIO_DEFAULT,
  applySeed,
  normalizeAdmin,
  adminDefault,
} from "./constants";
import {
  applyContractDates,
  contractStatus,
  currentMonthIdx,
  fdate,
} from "./logic";
import type { AdminConfig, Backup, MonthInfo, Servicio, Tarifario } from "./model";
import {
  backupFileName,
  buildBackup,
  loadAdminRaw,
  loadMonth,
  loadTarifarioOrSeed,
  restoreBackup,
  saveAdmin,
  saveMonth,
  saveTarifario,
  storageAvailable,
  validateBackup,
  kvMeta,
  setStorageNamespace,
  type ModuloNs,
} from "./storage";

export interface UseTransporte {
  /** Módulo (espacio de datos): "transporte" = Transporte AAA, "alquiler" = Contrato de Alquiler. */
  ns: ModuloNs;
  // Estado de carga y sincronización
  loading: boolean;
  error: string | null;
  /** true = sin Supabase configurado (datos de semilla en memoria, no persisten). */
  demo: boolean;
  lastSyncAt: Date | null;
  saving: boolean;

  // Datos
  admin: AdminConfig | null;
  tarifario: Tarifario | null;
  /** Meses visibles: la vigencia SIN los meses iniciales ya pasados y sin registros (p. ej. julio 2026). */
  months: MonthInfo[];
  /** Todos los meses calendario de la vigencia (para presupuestos/promedios). */
  allMonths: MonthInfo[];
  servicesByMonth: Record<string, Servicio[]>;

  // Mes activo
  activeMonthIdx: number;
  setActiveMonthIdx: (i: number) => void;
  activeMonth: MonthInfo | null;
  activeServices: Servicio[];

  // Contrato
  contractStart: Date;
  contractEndExclusive: Date;
  status: { label: string; activo: boolean; pctTiempo: number };

  // Polling
  isModalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  refresh: () => Promise<void>;

  // Mutaciones (optimistas con revert; lanzan Error con mensaje legible)
  upsertService: (monthKey: string, item: Servicio) => Promise<void>;
  deleteService: (monthKey: string, id: string) => Promise<void>;
  toggleInvoiced: (monthKey: string, id: string) => Promise<void>;
  markInvoiced: (pairs: Array<{ monthKey: string; id: string }>) => Promise<void>;
  /** Marca servicios con el N° de prefactura que los incluyó (null = desmarcar). */
  markPrefacturada: (pairs: Array<{ monthKey: string; id: string }>, numero: string | null) => Promise<void>;
  saveTarifarioCfg: (t: Tarifario) => Promise<void>;
  resetTarifario: () => Promise<void>;
  saveAdminCfg: (mutator: (a: AdminConfig) => void) => Promise<AdminConfig>;

  // Backup
  downloadBackup: () => Promise<void>;
  restoreFromBackup: (payload: unknown) => Promise<number>;
}

export function useTransporte(ns: ModuloNs = "transporte"): UseTransporte {
  // Fija el espacio de datos ANTES de cualquier lectura (render sincrónico).
  setStorageNamespace(ns);
  const demo = !storageAvailable();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [admin, setAdmin] = useState<AdminConfig | null>(null);
  const [tarifario, setTarifario] = useState<Tarifario | null>(null);
  const [contract, setContract] = useState(() => applyContractDates("2026-07-01", "2027-08-31"));
  // Los meses arrancan con la vigencia por defecto para que las pestañas de
  // Registros existan aunque la carga inicial falle (p. ej. tabla ausente).
  const [months, setMonths] = useState<MonthInfo[]>(() => contract.months);
  const [servicesByMonth, setServicesByMonth] = useState<Record<string, Servicio[]>>({});
  const [activeMonthIdx, setActiveMonthIdx] = useState(() => currentMonthIdx(contract.months));
  const [isModalOpen, setIsModalOpen] = useState(false);

  const modalOpenRef = useRef(false);
  const pollTickRef = useRef(0);
  const signatureRef = useRef("");
  const monthsRef = useRef<MonthInfo[]>([]);
  const activeIdxRef = useRef(0);
  /** updated_at conocido por clave: solo se vuelve a descargar lo que cambió en el servidor. */
  const metaRef = useRef<Record<string, string>>({});
  monthsRef.current = months;
  activeIdxRef.current = activeMonthIdx;

  const setModalOpen = useCallback((open: boolean) => {
    modalOpenRef.current = open;
    setIsModalOpen(open);
  }, []);

  // ── Cargas ───────────────────────────────────────────────────────

  const loadAllMonths = useCallback(async (list: MonthInfo[]) => {
    const entries = await Promise.all(list.map(async (m) => [m.key, await loadMonth(m.key)] as const));
    setServicesByMonth(Object.fromEntries(entries));
    metaRef.current = await kvMeta().catch(() => metaRef.current);
  }, []);

  const applyAdminContract = useCallback(
    async (a: AdminConfig, reloadMonths: boolean) => {
      const c = applyContractDates(a.contractStart || "2026-07-01", a.contractEnd || "");
      const changed = c.signature !== signatureRef.current;
      if (changed) {
        signatureRef.current = c.signature;
        setContract(c);
        setMonths(c.months);
        setActiveMonthIdx(currentMonthIdx(c.months));
      }
      if (changed || reloadMonths) await loadAllMonths(c.months);
      return c;
    },
    [loadAllMonths],
  );

  // Carga inicial: tarifario (o default), admin (normaliza + applySeed), meses.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await loadTarifarioOrSeed();
        if (!alive) return;
        setTarifario(t);

        let a = await loadAdminRaw();
        const nuevo = !a;
        a = a ?? normalizeAdmin(adminDefault());
        const seeded = applySeed(a);
        if (nuevo || seeded) await saveAdmin(a).catch(() => undefined);
        if (!alive) return;
        setAdmin(a);
        await applyAdminContract(a, true);
        if (!alive) return;
        setLastSyncAt(new Date());
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudieron cargar los datos del panel.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sondeo cada 20 s (pausado con modal abierto) ─────────────────
  // Una sola consulta ligera de metadatos (clave → updated_at) y se descarga
  // ÚNICAMENTE lo que cambió en el servidor (antes se bajaban los 14 meses,
  // con el bloque de ~12 MB de fotos, cada minuto aunque nada hubiera cambiado).
  const refreshOnce = useCallback(
    async (todos: boolean) => {
      const list = monthsRef.current;
      if (todos || list.length === 0) {
        const a = await loadAdminRaw();
        if (a) { setAdmin(a); await applyAdminContract(a, false); }
        await loadAllMonths(list);
        setLastSyncAt(new Date());
        return;
      }
      const meta = await kvMeta();
      const prev = metaRef.current;
      const cambio = (k: string) => (meta[k] ?? "") !== (prev[k] ?? "");
      if (cambio("adminconfig")) {
        const a = await loadAdminRaw();
        if (a) { setAdmin(a); await applyAdminContract(a, false); }
      }
      const pendientes = list.filter((m) => cambio(`services:${m.key}`));
      if (pendientes.length) {
        const entries = await Promise.all(pendientes.map(async (m) => [m.key, await loadMonth(m.key)] as const));
        setServicesByMonth((p) => ({ ...p, ...Object.fromEntries(entries) }));
      }
      metaRef.current = meta;
      setLastSyncAt(new Date());
    },
    [applyAdminContract, loadAllMonths],
  );

  useEffect(() => {
    if (loading) return;
    const id = setInterval(() => {
      if (modalOpenRef.current) return; // pausa con modal/drawer abierto
      pollTickRef.current += 1;
      refreshOnce(false).catch(() => undefined); // solo lo que cambió
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loading, refreshOnce]);

  const refresh = useCallback(async () => {
    try {
      await refreshOnce(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }, [refreshOnce]);

  // ── Mutaciones de servicios (optimistas con revert) ──────────────

  const persistMonth = useCallback(
    async (monthKey: string, next: Servicio[], prev: Servicio[]) => {
      setServicesByMonth((s) => ({ ...s, [monthKey]: next }));
      setSaving(true);
      try {
        await saveMonth(monthKey, next, {
          onWarn: (mb) =>
            typeof window === "undefined"
              ? true
              : window.confirm(
                  `Aviso: este mes ya acumula ${mb} MB en adjuntos. El guardado puede volverse lento. ¿Guardar de todas formas?`,
                ),
        });
        setLastSyncAt(new Date());
      } catch (e) {
        setServicesByMonth((s) => ({ ...s, [monthKey]: prev })); // revert
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const upsertService = useCallback(
    async (monthKey: string, item: Servicio) => {
      const prev = servicesByMonth[monthKey] ?? [];
      const idx = prev.findIndex((s) => s.id === item.id);
      const next = idx >= 0 ? prev.map((s) => (s.id === item.id ? item : s)) : [...prev, item];
      await persistMonth(monthKey, next, prev);
    },
    [servicesByMonth, persistMonth],
  );

  const markPrefacturada = useCallback(
    async (pairs: Array<{ monthKey: string; id: string }>, numero: string | null) => {
      const porMes = new Map<string, Set<string>>();
      pairs.forEach(({ monthKey, id }) => {
        if (!porMes.has(monthKey)) porMes.set(monthKey, new Set());
        porMes.get(monthKey)!.add(id);
      });
      for (const [mk, ids] of porMes) {
        const prev = servicesByMonth[mk] ?? [];
        const next = prev.map((s) => (ids.has(s.id) ? { ...s, prefactura: numero } : s));
        await persistMonth(mk, next, prev);
      }
    },
    [servicesByMonth, persistMonth],
  );

  const deleteService = useCallback(
    async (monthKey: string, id: string) => {
      const prev = servicesByMonth[monthKey] ?? [];
      await persistMonth(monthKey, prev.filter((s) => s.id !== id), prev);
    },
    [servicesByMonth, persistMonth],
  );

  const toggleInvoiced = useCallback(
    async (monthKey: string, id: string) => {
      const prev = servicesByMonth[monthKey] ?? [];
      const next = prev.map((s) => (s.id === id ? { ...s, invoiced: !s.invoiced } : s));
      await persistMonth(monthKey, next, prev);
    },
    [servicesByMonth, persistMonth],
  );

  const markInvoiced = useCallback(
    async (pairs: Array<{ monthKey: string; id: string }>) => {
      const porMes = new Map<string, Set<string>>();
      pairs.forEach(({ monthKey, id }) => {
        if (!porMes.has(monthKey)) porMes.set(monthKey, new Set());
        porMes.get(monthKey)!.add(id);
      });
      for (const [mk, ids] of porMes) {
        const prev = servicesByMonth[mk] ?? [];
        const next = prev.map((s) => (ids.has(s.id) ? { ...s, invoiced: true } : s));
        await persistMonth(mk, next, prev);
      }
    },
    [servicesByMonth, persistMonth],
  );

  // ── Tarifario / admin ────────────────────────────────────────────

  const saveTarifarioCfg = useCallback(async (t: Tarifario) => {
    const prev = tarifario;
    setTarifario(t);
    setSaving(true);
    try {
      await saveTarifario(t);
    } catch (e) {
      setTarifario(prev);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [tarifario]);

  const resetTarifario = useCallback(async () => {
    await saveTarifarioCfg(JSON.parse(JSON.stringify(TARIFARIO_DEFAULT)) as Tarifario);
  }, [saveTarifarioCfg]);

  /** Muta una copia del admin actual y la persiste (optimista con revert). */
  const saveAdminCfg = useCallback(
    async (mutator: (a: AdminConfig) => void) => {
      const prev = admin ?? normalizeAdmin(adminDefault());
      const next = JSON.parse(JSON.stringify(prev)) as AdminConfig;
      mutator(next);
      setAdmin(next);
      setSaving(true);
      try {
        await saveAdmin(next);
        await applyAdminContract(next, false);
        return next;
      } catch (e) {
        setAdmin(prev);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [admin, applyAdminContract],
  );

  // ── Backup / restore ─────────────────────────────────────────────

  const downloadBackup = useCallback(async () => {
    const payload = await buildBackup(monthsRef.current);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    await saveAdminCfg((adm) => { adm.backupLastAt = payload.generatedAt; }).catch(() => undefined);
  }, [saveAdminCfg]);

  /** Valida y restaura; devuelve el número de bloques restaurados. SOBRESCRIBE todo. */
  const restoreFromBackup = useCallback(
    async (payload: unknown) => {
      const v = validateBackup(payload);
      if (!v.ok) throw new Error(v.error);
      await restoreBackup(v.backup as Backup);
      await refresh();
      return v.blocks;
    },
    [refresh],
  );

  // ── Derivados ────────────────────────────────────────────────────

  // Meses visibles: se ocultan los meses INICIALES de la vigencia que ya pasaron y
  // no tienen ningún registro (p. ej. julio 2026, antes del primer servicio), para
  // que las pestañas y gráficas arranquen donde arranca la operación real.
  // Los meses del contrato completos siguen en `allMonths` para los promedios.
  const hiddenCount = useMemo(() => {
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let i = 0;
    while (i < months.length - 1 && months[i].key < nowKey && (servicesByMonth[months[i].key] ?? []).length === 0) i++;
    return i;
  }, [months, servicesByMonth]);
  const visibleMonths = useMemo(() => months.slice(hiddenCount), [months, hiddenCount]);
  const fullActiveIdx = Math.max(activeMonthIdx, hiddenCount);
  const setVisibleActiveIdx = useCallback((i: number) => setActiveMonthIdx(i + hiddenCount), [hiddenCount]);

  const activeMonth = months[fullActiveIdx] ?? null;
  const activeServices = useMemo(
    () => (activeMonth ? servicesByMonth[activeMonth.key] ?? [] : []),
    [activeMonth, servicesByMonth],
  );
  const status = useMemo(() => contractStatus(contract.start, contract.endExclusive), [contract]);

  return {
    ns,
    loading,
    error,
    demo,
    lastSyncAt,
    saving,
    admin,
    tarifario,
    months: visibleMonths,
    allMonths: months,
    servicesByMonth,
    activeMonthIdx: fullActiveIdx - hiddenCount,
    setActiveMonthIdx: setVisibleActiveIdx,
    activeMonth,
    activeServices,
    contractStart: contract.start,
    contractEndExclusive: contract.endExclusive,
    status,
    isModalOpen,
    setModalOpen,
    refresh,
    upsertService,
    deleteService,
    toggleInvoiced,
    markInvoiced,
    markPrefacturada,
    saveTarifarioCfg,
    resetTarifario,
    saveAdminCfg,
    downloadBackup,
    restoreFromBackup,
  };
}

/** Props estándar de todas las vistas del módulo (las inyecta TransporteClient). */
export interface ViewProps {
  t: UseTransporte;
}

/** Etiqueta de última sincronización para la cabecera. */
export function syncLabel(t: Pick<UseTransporte, "demo" | "lastSyncAt" | "saving">): string {
  if (t.demo) return "Modo demo — sin guardar (configura Supabase)";
  if (t.saving) return "Sincronizando…";
  return t.lastSyncAt ? `Sincronizado ${t.lastSyncAt.toLocaleTimeString("es-CO")}` : "Cargando…";
}

export { fdate };
