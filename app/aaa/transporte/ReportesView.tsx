"use client";
// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Vista Reportes (SPEC §5.4 y §5.8)
// Reporte analítico con 12 filtros, totales, tabla, gráficas CSS/SVG
// (sin Chart.js), cumplimiento, emergencias vs. límite de 3 h, ranking
// de riesgo y mapa de calor día×franja (tonos del azul de marca).
// Reportes rápidos por escenario (día / vehículo / área AAA) y
// exportaciones CSV / XLSX / PDF con soportes (lib/transporte/export.ts).
// Según SPEC §4.7, las exportaciones de esta vista NO preguntan por
// marcar facturado (askInvoice:false en el original).
// ════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { IconDownload } from "../../icons";
import type { CSSProperties, ReactNode } from "react";
import type { ViewProps } from "@/lib/transporte/useTransporte";
import { fdate, fmtCOP, fmtMes, respHours, slugify } from "@/lib/transporte/logic";
import type { Servicio } from "@/lib/transporte/model";
import { aprobadorDe, areaAAADe, num } from "@/lib/transporte/model";
import { exportServicios, type ExportFormat, type ExportPair } from "@/lib/transporte/export";

// ── Utilidades locales ─────────────────────────────────────────────

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const TIPOS = ["Programado", "No Programado", "Emergencia"] as const;

const TIPO_BADGE: Record<string, string> = {
  Programado: "ok",
  "No Programado": "warn",
  Emergencia: "high",
};

interface Filtros {
  desde: string;
  hasta: string;
  tipo: string;
  facturado: string; // '' | 'si' | 'no'
  placa: string;
  conductor: string;
  area: string;
  areaAAA: string;
  interventor: string;
  aprobador: string;
  valorMin: string;
  valorMax: string;
}

const FILTROS_VACIOS: Filtros = {
  desde: "",
  hasta: "",
  tipo: "",
  facturado: "",
  placa: "",
  conductor: "",
  area: "",
  areaAAA: "",
  interventor: "",
  aprobador: "",
  valorMin: "",
  valorMax: "",
};

/** Fila etiqueta + valor para las tarjetas de estadísticas. */
function FilaDato({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        padding: "7px 0",
        borderBottom: "1px solid var(--border)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      <b className="num" style={{ whiteSpace: "nowrap" }}>{value}</b>
    </div>
  );
}

function NotaVacia({ children }: { children: ReactNode }) {
  return <div className="muted" style={{ fontSize: 13, padding: "8px 0" }}>{children}</div>;
}

// ── Vista ──────────────────────────────────────────────────────────

export function ReportesView({ t }: ViewProps) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [pairs, setPairs] = useState<ExportPair[] | null>(null); // null = aún sin generar
  const [msg, setMsg] = useState<string | null>(null);
  const [exportando, setExportando] = useState<ExportFormat | null>(null);

  // Modal de reporte por escenario
  const [repOpen, setRepOpen] = useState(false);
  const [repTipo, setRepTipo] = useState<"dia" | "vehiculo" | "area">("dia");
  const [repFecha, setRepFecha] = useState(() => isoOf(new Date()));
  const [repPlaca, setRepPlaca] = useState("");
  const [repArea, setRepArea] = useState("");
  const [repIncludeInv, setRepIncludeInv] = useState(true);
  const [repMsg, setRepMsg] = useState<string | null>(null);
  const [repExportando, setRepExportando] = useState<ExportFormat | null>(null);

  const setF = (k: keyof Filtros) => (e: { target: { value: string } }) =>
    setFiltros((f) => ({ ...f, [k]: e.target.value }));

  // Todos los servicios de la vigencia como pares con etiqueta de mes.
  const allPairs = useMemo<ExportPair[]>(
    () =>
      t.months.flatMap((mo) =>
        (t.servicesByMonth[mo.key] ?? []).map((item) => ({ monthKey: mo.key, monthLabel: mo.label, item })),
      ),
    [t.months, t.servicesByMonth],
  );

  // Contexto común de exportación (vigencia + total global para el saldo del PDF).
  const exportCtx = useMemo(() => {
    const lastDay = new Date(
      t.contractEndExclusive.getFullYear(),
      t.contractEndExclusive.getMonth(),
      t.contractEndExclusive.getDate() - 1,
    );
    return {
      vigencia: `${fdate(isoOf(t.contractStart))} - ${fdate(isoOf(lastDay))}`,
      totalGlobalValue: allPairs.reduce((s, p) => s + num(p.item.value), 0),
    };
  }, [t.contractStart, t.contractEndExclusive, allPairs]);

  // Datalist del filtro «Área AAA solicitante»: maestras + usadas (con alias legado).
  const areasAAAConocidas = useMemo(() => {
    const set = new Set<string>(t.admin?.areas ?? []);
    allPairs.forEach((p) => {
      const a = areaAAADe(p.item);
      if (a) set.add(a);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [t.admin, allPairs]);

  // ── Filtro analítico (12 criterios, SPEC §5.4) ───────────────────
  const generar = () => {
    const f = filtros;
    const placa = f.placa.trim().toLowerCase();
    const conductor = f.conductor.trim().toLowerCase();
    const area = f.area.trim().toLowerCase();
    const areaAAA = f.areaAAA.trim().toLowerCase();
    const interventor = f.interventor.trim().toLowerCase();
    const res = allPairs.filter(({ item }) => {
      if (f.desde && item.date && item.date < f.desde) return false;
      if (f.hasta && item.date && item.date > f.hasta) return false;
      if (f.tipo && item.serviceType !== f.tipo) return false;
      if (f.facturado === "si" && !item.invoiced) return false;
      if (f.facturado === "no" && item.invoiced) return false;
      if (placa && !(item.plate || "").toLowerCase().includes(placa)) return false;
      if (conductor && !(item.driver || "").toLowerCase().includes(conductor)) return false;
      if (area && !(item.area || "").toLowerCase().includes(area)) return false;
      if (areaAAA && !areaAAADe(item).toLowerCase().includes(areaAAA)) return false;
      if (interventor && !(item.interventor || "").toLowerCase().includes(interventor)) return false;
      if (f.aprobador && aprobadorDe(item) !== f.aprobador) return false;
      if (f.valorMin && num(item.value) < num(f.valorMin)) return false;
      if (f.valorMax && num(item.value) > num(f.valorMax)) return false;
      return true;
    });
    setPairs(res);
    setMsg(null);
  };

  const limpiar = () => setFiltros(FILTROS_VACIOS);

  // ── Estadísticas del reporte generado ────────────────────────────
  const stats = useMemo(() => {
    if (!pairs) return null;
    const totalValor = pairs.reduce((s, p) => s + num(p.item.value), 0);
    const totalPeajes = pairs.reduce((s, p) => s + num(p.item.tolls), 0);
    const pendientes = pairs.filter((p) => !p.item.invoiced).length;

    const byMonth = new Map<string, number>();
    t.months.forEach((mo) => byMonth.set(mo.key, 0));
    pairs.forEach((p) => byMonth.set(p.monthKey, (byMonth.get(p.monthKey) ?? 0) + num(p.item.value)));
    const mensual = t.months.map((mo) => ({ key: mo.key, valor: byMonth.get(mo.key) ?? 0 }));

    const tipoCounts = TIPOS.map((x) => pairs.filter((p) => p.item.serviceType === x).length);

    const byPlaca = new Map<string, { count: number; value: number }>();
    pairs.forEach(({ item }) => {
      const k = item.plate || "(sin placa)";
      const d = byPlaca.get(k) ?? { count: 0, value: 0 };
      d.count += 1;
      d.value += num(item.value);
      byPlaca.set(k, d);
    });
    const rankVeh = [...byPlaca.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 5);

    const byDriver = new Map<string, number>();
    pairs.forEach(({ item }) => {
      const k = item.driver || "(sin conductor)";
      byDriver.set(k, (byDriver.get(k) ?? 0) + 1);
    });
    const rankDriver = [...byDriver.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const byArea = new Map<string, number>();
    pairs.forEach(({ item }) => {
      const k = item.area || "(sin municipio)";
      byArea.set(k, (byArea.get(k) ?? 0) + 1);
    });
    const rankArea = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const conFoto = pairs.filter((p) => p.item.photo).length;
    const conVbo = pairs.filter((p) => p.item.approved).length;
    const emergencias = pairs.filter((p) => p.item.serviceType === "Emergencia");
    const rh = (s: Servicio) => respHours(s.hourReq, s.hourAtt);
    const emerConTiempo = emergencias.filter((p) => rh(p.item) != null);
    const emerFuera = emerConTiempo.filter((p) => (rh(p.item) as number) > 3).length;
    const avgResp = emerConTiempo.length
      ? emerConTiempo.reduce((s, p) => s + (rh(p.item) as number), 0) / emerConTiempo.length
      : null;

    // Ranking de riesgo: 1 incidencia por emergencia >3 h, soporte incompleto y sobrepeso.
    const riesgoPlaca = new Map<string, number>();
    const riesgoConductor = new Map<string, number>();
    pairs.forEach(({ item }) => {
      let inc = 0;
      const h = rh(item);
      if (item.serviceType === "Emergencia" && h != null && h > 3) inc++;
      if (!item.photo || !item.approved) inc++;
      if (item.weight && item.capacity && num(item.weight) > num(item.capacity)) inc++;
      if (inc > 0) {
        const kp = item.plate || "(sin placa)";
        const kc = item.driver || "(sin conductor)";
        riesgoPlaca.set(kp, (riesgoPlaca.get(kp) ?? 0) + inc);
        riesgoConductor.set(kc, (riesgoConductor.get(kc) ?? 0) + inc);
      }
    });
    const rankRiesgo = [
      ...[...riesgoPlaca.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => ({ tipo: "Vehículo", nombre: k, inc: c })),
      ...[...riesgoConductor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => ({ tipo: "Conductor", nombre: k, inc: c })),
    ];

    // Promedio de horas de respuesta de emergencias por mes (null = sin datos).
    const respPorMes = t.months.map((mo) => {
      const horas = pairs
        .filter((p) => p.monthKey === mo.key && p.item.serviceType === "Emergencia")
        .map((p) => rh(p.item))
        .filter((h): h is number => h != null);
      return horas.length ? horas.reduce((s, h) => s + h, 0) / horas.length : null;
    });

    // Mapa de calor día (0=Dom) × franja (00-06 / 06-12 / 12-18 / 18-24) por hora de solicitud.
    const heat: number[][] = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
    pairs.forEach(({ item }) => {
      if (!item.date || !item.hourReq) return;
      const dow = new Date(item.date + "T00:00:00").getDay();
      const hour = Number(item.hourReq.split(":")[0]);
      if (!Number.isFinite(hour)) return;
      heat[dow][hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3]++;
    });
    const maxHeat = Math.max(1, ...heat.flat());

    return {
      totalValor,
      totalPeajes,
      pendientes,
      mensual,
      tipoCounts,
      rankVeh,
      rankDriver,
      rankArea,
      conFoto,
      conVbo,
      emergencias: emergencias.length,
      emerFuera,
      avgResp,
      rankRiesgo,
      respPorMes,
      heat,
      maxHeat,
    };
  }, [pairs, t.months]);

  const ordenados = useMemo(
    () => (pairs ? pairs.slice().sort((a, b) => (a.item.date || "").localeCompare(b.item.date || "")) : []),
    [pairs],
  );

  // ── Exportación del reporte analítico (sin pregunta de facturación) ──
  const exportarFiltrado = async (fmt: ExportFormat) => {
    if (!pairs || !pairs.length) {
      setMsg("Primero genera el reporte con los filtros deseados.");
      return;
    }
    const hoy = isoOf(new Date());
    setExportando(fmt);
    setMsg(null);
    try {
      await exportServicios(pairs, fmt, `reporte_filtrado_${hoy}`, `Reporte filtrado - generado el ${hoy}`, exportCtx);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo exportar el reporte.");
    } finally {
      setExportando(null);
    }
  };

  // ── Reporte por escenario (SPEC §5.8) ────────────────────────────
  const placasEscenario = useMemo(() => {
    const set = new Set<string>();
    allPairs.forEach((p) => {
      if (p.item.plate) set.add(String(p.item.plate).toUpperCase());
    });
    (t.admin?.vehiculos ?? []).forEach((v) => set.add(String(v.plate).toUpperCase()));
    return [...set].sort();
  }, [allPairs, t.admin]);

  const areasEscenario = useMemo(() => {
    const set = new Set<string>();
    // Corrección consciente sobre el original (SPEC §8.2): aquí también se
    // consideran las áreas guardadas bajo el alias legado `areaSolicitante`.
    allPairs.forEach((p) => {
      const a = areaAAADe(p.item);
      if (a) set.add(a);
    });
    (t.admin?.areas ?? []).forEach((a) => set.add(a));
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [allPairs, t.admin]);

  const abrirEscenario = () => {
    setRepFecha(isoOf(new Date()));
    setRepPlaca(placasEscenario[0] ?? "");
    setRepArea(areasEscenario[0] ?? "");
    setRepIncludeInv(true);
    setRepMsg(null);
    setRepOpen(true);
    t.setModalOpen(true);
  };
  const cerrarEscenario = () => {
    setRepOpen(false);
    t.setModalOpen(false);
  };

  useEffect(() => {
    if (!repOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarEscenario();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repOpen]);

  const exportarEscenario = async (fmt: ExportFormat) => {
    let pred: (it: Servicio) => boolean;
    let scope: string;
    let base: string;
    if (repTipo === "dia") {
      if (!repFecha) {
        setRepMsg("Selecciona la fecha del reporte.");
        return;
      }
      pred = (it) => it.date === repFecha;
      scope = `Reporte por día - ${repFecha}`;
      base = `reporte_dia_${repFecha}`;
    } else if (repTipo === "vehiculo") {
      if (!repPlaca) {
        setRepMsg("No hay vehículos disponibles para el reporte.");
        return;
      }
      pred = (it) => String(it.plate || "").toUpperCase() === repPlaca;
      scope = `Reporte por vehículo - Placa ${repPlaca}`;
      base = `reporte_vehiculo_${slugify(repPlaca)}`;
    } else {
      if (!repArea) {
        setRepMsg("No hay áreas disponibles para el reporte.");
        return;
      }
      // El original comparaba solo `it.areaAAA`; aquí se corrige con el
      // lector de alias legado (areaAAADe) para no omitir datos viejos.
      pred = (it) => areaAAADe(it) === repArea;
      scope = `Reporte por área AAA - ${repArea}`;
      base = `reporte_area_${slugify(repArea)}`;
    }
    const seleccion = allPairs
      .filter((p) => (repIncludeInv || !p.item.invoiced) && pred(p.item))
      .sort(
        (x, y) =>
          String(x.item.date || "").localeCompare(String(y.item.date || "")) ||
          String(x.item.hourReq || "").localeCompare(String(y.item.hourReq || "")),
      );
    if (!seleccion.length) {
      setRepMsg("No se encontraron servicios para ese criterio.");
      return;
    }
    setRepExportando(fmt);
    setRepMsg(null);
    try {
      await exportServicios(seleccion, fmt, base, scope, exportCtx);
      setRepMsg(`Reporte generado: ${seleccion.length} servicio(s).`);
    } catch (e) {
      setRepMsg(e instanceof Error ? e.message : "No se pudo exportar el reporte.");
    } finally {
      setRepExportando(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  const perfiles = t.admin ? Object.values(t.admin.profiles).map((p) => p.label) : ["Gerencia", "Renzo", "Jesús"];

  return (
    <>
      {/* ── Filtros del reporte analítico ── */}
      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>Reporte analítico</span>
        <span className="topbar-spacer" style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={abrirEscenario}>Reporte por escenario</button>
      </div>

      <div className="table-wrap" style={{ padding: 18, display: "grid", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <label className="field">Fecha desde
            <input className="input" type="date" value={filtros.desde} onChange={setF("desde")} />
          </label>
          <label className="field">Fecha hasta
            <input className="input" type="date" value={filtros.hasta} onChange={setF("hasta")} />
          </label>
          <label className="field">Tipo de servicio
            <select value={filtros.tipo} onChange={setF("tipo")}>
              <option value="">Todos</option>
              {TIPOS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="field">Estado de facturación
            <select value={filtros.facturado} onChange={setF("facturado")}>
              <option value="">Todos</option>
              <option value="si">Facturado</option>
              <option value="no">Pendiente</option>
            </select>
          </label>
          <label className="field">Placa / vehículo
            <input className="input" value={filtros.placa} onChange={setF("placa")} placeholder="Contiene…" />
          </label>
          <label className="field">Conductor
            <input className="input" value={filtros.conductor} onChange={setF("conductor")} placeholder="Contiene…" />
          </label>
          <label className="field">Municipio / área
            <input className="input" value={filtros.area} onChange={setF("area")} placeholder="Contiene…" />
          </label>
          <label className="field">Área AAA solicitante
            <input className="input" list="tx-rv-areas" value={filtros.areaAAA} onChange={setF("areaAAA")} placeholder="Contiene…" />
            <datalist id="tx-rv-areas">
              {areasAAAConocidas.map((a) => <option key={a} value={a} />)}
            </datalist>
          </label>
          <label className="field">Interventor
            <input className="input" value={filtros.interventor} onChange={setF("interventor")} placeholder="Contiene…" />
          </label>
          <label className="field">Aprobado por
            <select value={filtros.aprobador} onChange={setF("aprobador")}>
              <option value="">Todos</option>
              {perfiles.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="field">Valor mínimo (COP)
            <input className="input" type="number" min={0} value={filtros.valorMin} onChange={setF("valorMin")} />
          </label>
          <label className="field">Valor máximo (COP)
            <input className="input" type="number" min={0} value={filtros.valorMax} onChange={setF("valorMax")} />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={limpiar}>Limpiar filtros</button>
          <span className="topbar-spacer" style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={generar}>Generar reporte</button>
        </div>
      </div>

      {!pairs && (
        <div className="table-wrap" style={{ padding: 18, marginBottom: 18 }}>
          <span className="muted">Ajusta los filtros y presiona «Generar reporte» para ver resultados y estadísticas.</span>
        </div>
      )}

      {pairs && stats && (
        <>
          {/* ── Totales ── */}
          <div className="estado-panel" style={{ marginBottom: 14 }}>
            <div className="estado-item">
              <span className="estado-label">Servicios</span>
              <span className="estado-val">{pairs.length}</span>
            </div>
            <div className="estado-item">
              <span className="estado-label">Valor total</span>
              <span className="estado-val">{fmtCOP(stats.totalValor)}</span>
            </div>
            <div className="estado-item">
              <span className="estado-label">Peajes</span>
              <span className="estado-val">{fmtCOP(stats.totalPeajes)}</span>
            </div>
            <div className="estado-item">
              <span className="estado-label">Pendientes por facturar</span>
              <span className="estado-val">{stats.pendientes}</span>
            </div>
          </div>

          {/* ── Exportación del reporte filtrado ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <span className="muted" style={{ fontSize: 13 }}>Exportar resultado:</span>
            <button className="btn btn-ghost btn-sm" disabled={exportando !== null} onClick={() => void exportarFiltrado("csv")}>
              <IconDownload width={15} height={15} /> {exportando === "csv" ? "Generando…" : "CSV"}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={exportando !== null} onClick={() => void exportarFiltrado("xlsx")}>
              <IconDownload width={15} height={15} /> {exportando === "xlsx" ? "Generando…" : "Excel"}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={exportando !== null} onClick={() => void exportarFiltrado("pdf")}>
              <IconDownload width={15} height={15} /> {exportando === "pdf" ? "Generando…" : "PDF con soportes"}
            </button>
            {msg && <span style={{ color: "var(--high)", fontSize: 13 }}>{msg}</span>}
          </div>

          {/* ── Tabla de resultados ── */}
          <div className="table-wrap table-scroll" style={{ marginBottom: 18 }}>
            <table className="clean">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Área AAA</th>
                  <th>Placa</th>
                  <th>Conductor</th>
                  <th>Municipio</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Facturado</th>
                  <th>Aprobó</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.length ? (
                  ordenados.map(({ item, monthKey }) => (
                    <tr key={`${monthKey}:${item.id}`}>
                      <td><b>{item.date ? fdate(item.date) : "—"}</b></td>
                      <td>
                        <span className={`badge ${TIPO_BADGE[item.serviceType] ?? "warn"}`}>
                          {item.serviceType || "—"}
                        </span>
                      </td>
                      <td>{areaAAADe(item) || "—"}</td>
                      <td>{item.plate || "—"}</td>
                      <td>{item.driver || "—"}</td>
                      <td>{item.area || "—"}</td>
                      <td className="num" style={{ textAlign: "right" }}><b>{fmtCOP(item.value)}</b></td>
                      <td>{item.invoiced ? <span className="badge ok">Sí</span> : <span className="badge warn">Pendiente</span>}</td>
                      <td>{aprobadorDe(item) || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={9} className="muted" style={{ padding: 18 }}>Ningún servicio coincide con estos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Gráficas y tarjetas ── */}
          <div className="charts-grid">
            <ChartMensual meses={t.months.map((m) => m.key)} datos={stats.mensual} />
            <ChartTipos counts={stats.tipoCounts} total={pairs.length} />
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-title">Top 5 vehículos por valor</div>
              <div className="chart-sub">suma del valor facturable por placa</div>
              {stats.rankVeh.length ? (
                stats.rankVeh.map(([p, d]) => (
                  <FilaDato key={p} label={`${p} (${d.count} serv.)`} value={fmtCOP(d.value)} />
                ))
              ) : (
                <NotaVacia>Sin datos con estos filtros.</NotaVacia>
              )}
            </div>
            <div className="chart-card">
              <div className="chart-title">Top 5 conductores por servicios</div>
              <div className="chart-sub">número de servicios registrados</div>
              {stats.rankDriver.length ? (
                stats.rankDriver.map(([n, c]) => <FilaDato key={n} label={n} value={c} />)
              ) : (
                <NotaVacia>Sin datos con estos filtros.</NotaVacia>
              )}
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-title">Distribución por municipio / área</div>
              <div className="chart-sub">top 8 por número de servicios</div>
              {stats.rankArea.length ? (
                stats.rankArea.map(([a, c]) => <FilaDato key={a} label={a} value={c} />)
              ) : (
                <NotaVacia>Sin datos con estos filtros.</NotaVacia>
              )}
            </div>
            <div className="chart-card">
              <div className="chart-title">Cumplimiento de soportes y emergencias</div>
              <div className="chart-sub">numerales 14 y 25 del contrato</div>
              <FilaDato label="Con evidencia fotográfica" value={`${pairs.length ? Math.round((stats.conFoto / pairs.length) * 100) : 0}%`} />
              <FilaDato label="Con V°B° del interventor" value={`${pairs.length ? Math.round((stats.conVbo / pairs.length) * 100) : 0}%`} />
              <FilaDato label="Emergencias registradas" value={stats.emergencias} />
              <FilaDato label="Emergencias atendidas en más de 3 h" value={stats.emerFuera} />
              <FilaDato label="Tiempo promedio de respuesta (emergencias)" value={stats.avgResp != null ? `${stats.avgResp.toFixed(1)} h` : "—"} />
            </div>
          </div>

          <div className="charts-grid">
            <ChartRespuesta meses={t.months.map((m) => m.key)} datos={stats.respPorMes} />
            <div className="chart-card">
              <div className="chart-title">Ranking de riesgo (más incidencias)</div>
              <div className="chart-sub">emergencias fuera de tiempo, soportes incompletos y sobrepesos</div>
              {stats.rankRiesgo.length ? (
                stats.rankRiesgo.map((r) => (
                  <FilaDato
                    key={`${r.tipo}:${r.nombre}`}
                    label={<><span className="muted" style={{ fontSize: 11.5 }}>{r.tipo}</span> {r.nombre}</>}
                    value={`${r.inc} incidencia(s)`}
                  />
                ))
              ) : (
                <NotaVacia>Sin incidencias en la selección filtrada.</NotaVacia>
              )}
            </div>
          </div>

          <Heatmap heat={stats.heat} max={stats.maxHeat} />
        </>
      )}

      {/* ── Modal de reporte por escenario (SPEC §5.8) ── */}
      {repOpen && (
        <>
          <div className="drawer-overlay" onClick={cerrarEscenario} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Reporte por escenario"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 41,
              display: "grid",
              placeItems: "center",
              padding: 20,
              pointerEvents: "none",
            }}
          >
            <div
              className="table-wrap"
              style={{
                pointerEvents: "auto",
                width: "min(560px, 96vw)",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "18px 22px",
                boxShadow: "0 18px 48px rgba(9,24,48,.25)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <h2 className="drawer-title">Reporte por escenario</h2>
                <span className="topbar-spacer" style={{ flex: 1 }} />
                <button className="drawer-close" onClick={cerrarEscenario} title="Cerrar (Esc)">×</button>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <label className="field">Escenario
                  <select
                    value={repTipo}
                    onChange={(e) => { setRepTipo(e.target.value as "dia" | "vehiculo" | "area"); setRepMsg(null); }}
                  >
                    <option value="dia">Por día</option>
                    <option value="vehiculo">Por vehículo</option>
                    <option value="area">Por área solicitante (AAA)</option>
                  </select>
                </label>

                {repTipo === "dia" && (
                  <label className="field">Fecha del reporte
                    <input className="input" type="date" value={repFecha} onChange={(e) => setRepFecha(e.target.value)} />
                  </label>
                )}
                {repTipo === "vehiculo" && (
                  <label className="field">Vehículo (placa)
                    <select value={repPlaca} onChange={(e) => setRepPlaca(e.target.value)}>
                      {placasEscenario.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                )}
                {repTipo === "area" && (
                  <label className="field">Área AAA solicitante
                    <select value={repArea} onChange={(e) => setRepArea(e.target.value)}>
                      {areasEscenario.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                )}

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)" }}>
                  <input
                    type="checkbox"
                    checked={repIncludeInv}
                    onChange={(e) => setRepIncludeInv(e.target.checked)}
                  />
                  Incluir servicios ya facturados
                </label>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="muted" style={{ fontSize: 13 }}>Descargar:</span>
                  <button className="btn btn-primary btn-sm" disabled={repExportando !== null} onClick={() => void exportarEscenario("csv")}>
                    <IconDownload width={15} height={15} /> {repExportando === "csv" ? "Generando…" : "CSV"}
                  </button>
                  <button className="btn btn-primary btn-sm" disabled={repExportando !== null} onClick={() => void exportarEscenario("xlsx")}>
                    <IconDownload width={15} height={15} /> {repExportando === "xlsx" ? "Generando…" : "Excel"}
                  </button>
                  <button className="btn btn-primary btn-sm" disabled={repExportando !== null} onClick={() => void exportarEscenario("pdf")}>
                    <IconDownload width={15} height={15} /> {repExportando === "pdf" ? "Generando…" : "PDF con soportes"}
                  </button>
                </div>
                {repMsg && (
                  <div style={{ color: repMsg.startsWith("Reporte generado") ? "var(--ok)" : "var(--high)", fontSize: 13 }}>
                    {repMsg}
                  </div>
                )}
                <div className="muted" style={{ fontSize: 12.5 }}>
                  Estos reportes rápidos no cambian el estado de facturación de los servicios.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Gráficas propias (solo CSS/SVG del proyecto) ───────────────────

/** Barras mensuales de valor ejecutado (patrón bars-month de RecaudoClient). */
function ChartMensual({ meses, datos }: { meses: string[]; datos: Array<{ key: string; valor: number }> }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="chart-card">
      <div className="chart-title">Valor ejecutado por mes (según filtro)</div>
      <div className="chart-sub">suma del valor de los servicios filtrados en cada mes de la vigencia</div>
      <div className="bars-month">
        {datos.map((d) => {
          const h = (d.valor / max) * 100;
          return (
            <div key={d.key} className="month-col" title={`${fmtMes(d.key)} · ${fmtCOP(d.valor)}`}>
              <div className="month-bar-wrap">
                <div className="month-track" style={{ height: `${Math.max(2, h)}%` }}>
                  <div className="month-fill" style={{ height: d.valor > 0 ? "100%" : "0%" }} />
                </div>
              </div>
              <span className="month-lbl">{fmtMes(d.key)}</span>
            </div>
          );
        })}
      </div>
      {meses.length === 0 && <NotaVacia>Sin meses en la vigencia.</NotaVacia>}
    </div>
  );
}

/** Dona SVG de distribución por tipo de servicio (tokens de estado del proyecto). */
function ChartTipos({ counts, total }: { counts: number[]; total: number }) {
  const colores = ["var(--brand-600)", "var(--warn)", "var(--high)"];
  const r = 46;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const segs = counts.map((n, i) => {
    const frac = total > 0 ? n / total : 0;
    const seg = { color: colores[i], dash: c * frac, offset: c * acc };
    acc += frac;
    return seg;
  });
  return (
    <div className="chart-card">
      <div className="chart-title">Distribución por tipo de servicio</div>
      <div className="chart-sub">programado / no programado / emergencia</div>
      <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
        <svg width={132} height={132} viewBox="0 0 120 120" role="img" aria-label="Distribución por tipo de servicio">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--brand-soft)" strokeWidth="16" />
          {segs.map((s, i) =>
            s.dash > 0 ? (
              <circle
                key={i}
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeDasharray={`${s.dash} ${c - s.dash}`}
                strokeDashoffset={-s.offset}
                transform="rotate(-90 60 60)"
              />
            ) : null,
          )}
          <text x="60" y="66" textAnchor="middle" style={{ font: "700 20px inherit", fill: "var(--text)" }}>
            {total}
          </text>
        </svg>
        <div style={{ display: "grid", gap: 6 }}>
          {TIPOS.map((x, i) => (
            <span key={x} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)" }}>
              <span className="legend-dot" style={{ background: colores[i] }} />
              {x} <b className="num">{counts[i]}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Línea SVG: promedio mensual de respuesta de emergencias vs. límite de 3 h. */
function ChartRespuesta({ meses, datos }: { meses: string[]; datos: Array<number | null> }) {
  const W = 640;
  const H = 240;
  const L = 40;
  const R = 10;
  const T = 12;
  const B = 34;
  const innerW = W - L - R;
  const innerH = H - T - B;
  const valores = datos.filter((d): d is number => d != null);
  const yMax = Math.max(4, Math.ceil(Math.max(3, ...valores) * 1.2));
  const x = (i: number) => L + (meses.length > 1 ? (i / (meses.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => T + innerH - (v / yMax) * innerH;
  // spanGaps: la línea conecta solo los meses con dato, en orden.
  const puntos = datos
    .map((v, i) => (v != null ? { i, v } : null))
    .filter((p): p is { i: number; v: number } => p !== null);
  const path = puntos.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, k) => (yMax / 4) * k);
  const lblStyle: CSSProperties = { font: "10px inherit", fill: "var(--muted)" };
  return (
    <div className="chart-card">
      <div className="chart-title">Tiempo de respuesta en emergencias</div>
      <div className="chart-sub">promedio mensual de horas entre solicitud y atención · límite contractual 3 h</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Tiempo de respuesta en emergencias por mes">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" style={lblStyle}>{v.toFixed(0)}h</text>
          </g>
        ))}
        {/* Límite contractual (3 h) */}
        <line x1={L} x2={W - R} y1={y(3)} y2={y(3)} stroke="var(--high)" strokeWidth="1.6" strokeDasharray="6 4" />
        {path && <path d={path} fill="none" stroke="var(--brand-600)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />}
        {puntos.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={3.4} fill="var(--brand-600)">
            <title>{`${fmtMes(meses[p.i])}: ${p.v.toFixed(1)} h`}</title>
          </circle>
        ))}
        {meses.map((m, i) =>
          meses.length <= 8 || i % 2 === 0 ? (
            <text key={m} x={x(i)} y={H - 12} textAnchor="middle" style={lblStyle}>{fmtMes(m)}</text>
          ) : null,
        )}
      </svg>
      <div className="chart-legend">
        <span><span className="legend-dot" style={{ background: "var(--brand-600)" }} />Horas promedio de respuesta</span>
        <span><span className="legend-dot" style={{ background: "var(--high)" }} />Límite contractual (3 h)</span>
      </div>
      {!puntos.length && <NotaVacia>Sin emergencias con horas registradas en la selección.</NotaVacia>}
    </div>
  );
}

const HEAT_DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const HEAT_FRANJAS: Array<[string, string]> = [
  ["Madrugada", "00-06h"],
  ["Mañana", "06-12h"],
  ["Tarde", "12-18h"],
  ["Noche", "18-24h"],
];

/** Mapa de calor día × franja horaria (tonos del azul de marca --brand). */
function Heatmap({ heat, max }: { heat: number[][]; max: number }) {
  const fondo = (v: number) =>
    v === 0
      ? "var(--surface-2)"
      : `color-mix(in srgb, var(--brand) ${Math.round((0.15 + 0.85 * (v / max)) * 100)}%, var(--surface))`;
  return (
    <div className="chart-card" style={{ marginBottom: 18 }}>
      <div className="chart-title">Mapa de calor — servicios por día y franja horaria</div>
      <div className="chart-sub">según la hora de solicitud de cada servicio filtrado</div>
      <div className="table-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 4, minWidth: 420 }}>
          <thead>
            <tr>
              <th />
              {HEAT_FRANJAS.map(([nombre, rango]) => (
                <th key={nombre} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", padding: "2px 4px" }}>
                  {nombre}
                  <br />
                  <span style={{ fontWeight: 400 }}>{rango}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HEAT_DIAS.map((d, di) => (
              <tr key={d}>
                <th style={{ textAlign: "right", paddingRight: 6, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{d}</th>
                {heat[di].map((v, fi) => (
                  <td key={fi} style={{ padding: 0 }}>
                    <div
                      className="num"
                      title={`${d} · ${HEAT_FRANJAS[fi][0]} ${HEAT_FRANJAS[fi][1]}: ${v} servicio(s)`}
                      style={{
                        height: 36,
                        borderRadius: "var(--radius-sm)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12.5,
                        background: fondo(v),
                        color: v > max * 0.55 ? "#fff" : "var(--text)",
                      }}
                    >
                      {v || ""}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
