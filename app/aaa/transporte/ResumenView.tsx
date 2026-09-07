"use client";
// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Vista Resumen (SPEC §5.1)
// Línea de tiempo del contrato, 6 KPIs, ejecución mensual (divs CSS,
// sin Chart.js), alertas contractuales (computeAlertas) y exportación
// global CSV / Excel / PDF con soportes vía lib/transporte/export.ts
// (módulo compartido con Registros y Reportes).
// ════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import {
  IconAlert,
  IconChart,
  IconCheck,
  IconCoins,
  IconDownload,
  IconTruck,
  IconWallet,
} from "../../icons";
import { CONTRACT_VALUE, CONTRATANTE, CONTRATISTA } from "@/lib/transporte/constants";
import {
  ALERTAS_MAX,
  ALERTAS_VACIO,
  collectAllItems,
  computeAlertas,
  fmtMes,
  fmtShort,
  totales,
} from "@/lib/transporte/logic";
import { num, type Servicio } from "@/lib/transporte/model";
import { exportServicios, type ExportFormat } from "@/lib/transporte/export";
import type { ViewProps } from "@/lib/transporte/useTransporte";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// ── Barra horizontal de progreso (patrón AaaClient/RecaudoClient) ──

function Bar({ label, value, total, pctLabel }: { label: string; value: number; total: number; pctLabel: string }) {
  const p = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="bar-row">
      <div className="bar-name">{label}</div>
      <div className="bar-track">
        <div
          className={`bar-fill${p >= 100 ? " full" : ""}`}
          style={p >= 100 ? { width: "100%", background: "var(--high)" } : { width: `${Math.min(p, 100)}%` }}
        />
      </div>
      <div className="bar-val">
        <b>{fmtShort(value)}</b>
        <div className="bar-pct">{p.toFixed(1)}% {pctLabel}</div>
      </div>
    </div>
  );
}

// ── Vista ──────────────────────────────────────────────────────────

export function ResumenView({ t }: ViewProps) {
  const [incluirFacturados, setIncluirFacturados] = useState(false);
  const [exportando, setExportando] = useState<ExportFormat | null>(null);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  // Todos los servicios de la vigencia, con su mes.
  const allPairs = useMemo(() => collectAllItems(t.servicesByMonth), [t.servicesByMonth]);
  const allItems = useMemo(() => allPairs.map(([, s]) => s), [allPairs]);
  const tot = useMemo(() => totales(allItems), [allItems]);

  // KPIs (fórmulas SPEC §5.1)
  const valorEjecutado = tot.valor;                          // Σ value
  const pctValor = CONTRACT_VALUE > 0 ? (valorEjecutado / CONTRACT_VALUE) * 100 : 0;
  const saldo = CONTRACT_VALUE - valorEjecutado;             // CONTRACT_VALUE − Σ value
  const saldoBajo = saldo < CONTRACT_VALUE * 0.1;            // warn si saldo < 10% del contrato
  const totalPeajes = tot.peajes;                            // Σ tolls
  const servicios = tot.servicios;                           // count
  const sinSoporte = tot.sinSoporte;                         // count(!photo || !approved)

  // Alertas contractuales (§4.9), máximo 8
  const alertas = useMemo(
    () => computeAlertas(t.servicesByMonth, t.admin).slice(0, ALERTAS_MAX),
    [t.servicesByMonth, t.admin],
  );

  // Ejecución mensual: barra = ejecutado del mes, track = presupuesto promedio
  const presupuestoMes = t.allMonths.length > 0 ? CONTRACT_VALUE / t.allMonths.length : 0;
  const ejecucionMensual = useMemo(
    () =>
      t.months.map((m) => ({
        key: m.key,
        label: m.label,
        real: (t.servicesByMonth[m.key] ?? []).reduce((acc, s) => acc + num(s.value), 0),
      })),
    [t.months, t.servicesByMonth],
  );
  const maxMes = Math.max(1, presupuestoMes, ...ejecucionMensual.map((m) => m.real));

  // Vigencia mostrada
  const inicio = t.contractStart;
  const finIncl = new Date(
    t.contractEndExclusive.getFullYear(),
    t.contractEndExclusive.getMonth(),
    t.contractEndExclusive.getDate() - 1,
  );
  const fFecha = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

  // ── Exportación global ───────────────────────────────────────────

  const itemsExportables = useMemo(() => {
    const pares = allPairs.filter(([, s]) => incluirFacturados || !s.invoiced);
    const labelDe = new Map(t.months.map((m) => [m.key, m.label]));
    return pares.map(([mk, s]) => ({ monthKey: mk, monthLabel: labelDe.get(mk) ?? mk, item: s }));
  }, [allPairs, incluirFacturados, t.months]);

  async function preguntarFacturacion(exportados: Array<{ monthKey: string; item: Servicio }>) {
    const pendientes = exportados.filter((x) => !x.item.invoiced);
    if (pendientes.length === 0) return;
    const ok = window.confirm(`¿Marcar los ${pendientes.length} servicio(s) pendientes exportados como facturados?`);
    if (!ok) return;
    await t.markInvoiced(pendientes.map((x) => ({ monthKey: x.monthKey, id: x.item.id })));
  }

  // Contexto del PDF: vigencia legible + total global (el saldo del PDF es global).
  const exportCtx = useMemo(
    () => ({
      vigencia: `${fFecha(inicio)} - ${fFecha(finIncl)}`,
      totalGlobalValue: valorEjecutado,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t.contractStart, t.contractEndExclusive, valorEjecutado],
  );

  async function exportar(fmt: ExportFormat) {
    setErrorExport(null);
    setExportando(fmt);
    try {
      await exportServicios(itemsExportables, fmt, "servicios_contrato_completo", "Todo el contrato", exportCtx);
      await preguntarFacturacion(itemsExportables);
    } catch (e) {
      setErrorExport(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <>
      {/* Datos del contrato */}
      <div className="section-title">Resumen del contrato</div>
      <div className="estado-panel">
        <div className="estado-item">
          <span className="estado-label">Contrato</span>
          <span className="estado-val">IS No. 04-2026</span>
        </div>
        <div className="estado-item">
          <span className="estado-label">Contratante</span>
          <span className="estado-val">{CONTRATANTE}</span>
        </div>
        <div className="estado-item">
          <span className="estado-label">Contratista</span>
          <span className="estado-val">{CONTRATISTA}</span>
        </div>
        <div className="estado-item">
          <span className="estado-label">Vigencia</span>
          <span className="estado-val">{fFecha(inicio)} — {fFecha(finIncl)}</span>
          <span className="estado-sub">{t.status.label}</span>
        </div>
        <div className="estado-item">
          <span className="estado-label">Estado</span>
          <span className={`badge ${t.status.activo ? "ok" : "warn"}`}>
            {t.status.activo ? "En ejecución" : t.status.pctTiempo >= 100 ? "Finalizado" : "Por iniciar"}
          </span>
        </div>
      </div>

      {/* Línea de tiempo: tiempo transcurrido vs. valor ejecutado */}
      <div className="chart-card" style={{ marginTop: 18 }}>
        <div className="chart-title">Línea de tiempo del contrato</div>
        <div className="chart-sub">
          Tiempo transcurrido: {t.status.pctTiempo.toFixed(1)}% · Valor ejecutado: {Math.min(100, pctValor).toFixed(1)}%
        </div>
        <Bar
          label="Tiempo transcurrido"
          value={(t.status.pctTiempo / 100) * CONTRACT_VALUE}
          total={CONTRACT_VALUE}
          pctLabel="del plazo"
        />
        <Bar label="Valor ejecutado" value={valorEjecutado} total={CONTRACT_VALUE} pctLabel="del contrato" />
      </div>

      {/* 6 KPIs (fórmulas SPEC §5.1) */}
      <div className="section-title">Indicadores del contrato</div>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico s-ok"><IconChart /></span>
            <span className="kpi-label">Valor ejecutado</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(valorEjecutado)}</div>
          <div className="kpi-foot">{pctValor.toFixed(1)}% del contrato</div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico"><IconWallet /></span>
            <span className="kpi-label">Valor del contrato</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(CONTRACT_VALUE)}</div>
          <div className="kpi-foot">IVA excluido</div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className={`kpi-ico${saldoBajo ? " s-warn" : ""}`}><IconCoins /></span>
            <span className="kpi-label">Saldo disponible</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19, color: saldoBajo ? "var(--warn)" : undefined }}>
            {COP.format(saldo)}
          </div>
          <div className="kpi-foot">Cláusula Segunda</div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico"><IconCoins /></span>
            <span className="kpi-label">Total peajes</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(totalPeajes)}</div>
          <div className="kpi-foot">A cargo del contratista</div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico"><IconTruck /></span>
            <span className="kpi-label">Servicios registrados</span>
          </div>
          <div className="kpi-value">{servicios.toLocaleString("es-CO")}</div>
          <div className="kpi-foot">Acumulado del contrato</div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className={`kpi-ico ${sinSoporte > 0 ? "s-high" : "s-ok"}`}>
              {sinSoporte > 0 ? <IconAlert /> : <IconCheck />}
            </span>
            <span className="kpi-label">Sin soporte completo</span>
          </div>
          <div className="kpi-value" style={{ color: sinSoporte > 0 ? "var(--high)" : "var(--ok)" }}>
            {sinSoporte.toLocaleString("es-CO")}
          </div>
          <div className="kpi-foot">Falta foto o V°B°</div>
        </div>
      </div>

      {/* Ejecución mensual — divs CSS (patrón bars-month), sin Chart.js */}
      <div className="chart-card" style={{ marginTop: 18 }}>
        <div className="chart-title">Ejecución mensual (valor facturado)</div>
        <div className="chart-sub">
          {t.months.length > 0 ? `${t.months[0].label} — ${t.months[t.months.length - 1].label}` : "—"} · barra =
          ejecutado del mes · fondo = presupuesto mensual promedio ({fmtShort(presupuestoMes)})
        </div>
        <div className="chart-legend">
          <span><span className="legend-dot" style={{ background: "var(--brand-soft)" }} />Presupuesto promedio mensual</span>
          <span><span className="legend-dot" style={{ background: "var(--brand-600)" }} />Ejecutado</span>
        </div>
        <div className="bars-month">
          {ejecucionMensual.map((m) => {
            const th = (Math.max(presupuestoMes, m.real) / maxMes) * 100;   // altura del track
            const fh = th > 0 ? ((m.real / maxMes) * 100 / th) * 100 : 0;   // fill en % del track
            return (
              <div
                key={m.key}
                className="month-col"
                title={`${m.label} · ejecutado ${COP.format(m.real)} · presupuesto ${COP.format(presupuestoMes)}`}
              >
                <div className="month-bar-wrap">
                  <div className="month-track" style={{ height: `${Math.max(2, th)}%` }}>
                    <div className="month-fill" style={{ height: `${Math.min(100, fh)}%` }} />
                  </div>
                </div>
                <span className="month-lbl">{fmtMes(m.key)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alertas contractuales */}
      <div className="chart-card" style={{ marginTop: 18 }}>
        <div className="chart-title">Alertas de cumplimiento</div>
        <div className="chart-sub">Generadas a partir de las cláusulas del contrato</div>
        {alertas.length === 0 ? (
          <div className="info-bar" style={{ background: "var(--ok-soft)", borderColor: "var(--border)", color: "var(--ok)", marginBottom: 0 }}>
            <IconCheck />
            <div>{ALERTAS_VACIO}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {alertas.map((a, i) => (
              <div
                key={i}
                className="info-bar"
                style={{
                  marginBottom: 0,
                  background: a.nivel === "high" ? "var(--high-soft)" : "var(--warn-soft)",
                  borderColor: a.nivel === "high" ? "#eccaca" : "var(--border)",
                  color: "var(--text-2)",
                }}
              >
                <span className={`badge ${a.nivel}`} style={{ flex: "none" }}>
                  {a.nivel === "high" ? "Crítica" : "Atención"}
                </span>
                <div>
                  <b style={{ color: a.nivel === "high" ? "var(--high)" : "var(--warn)" }}>{a.titulo}</b>
                  {" — "}{a.detalle}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exportación global del contrato */}
      <div className="chart-card" style={{ marginTop: 18 }}>
        <div className="chart-title">Exportación global del contrato</div>
        <div className="chart-sub">
          Servicios pendientes por facturar en todo el contrato: <b>{tot.pendientes.toLocaleString("es-CO")}</b> · Valor
          pendiente: <b className="num">{COP.format(tot.valorPendiente)}</b>
        </div>
        <div className="toolbar" style={{ alignItems: "center", gap: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={incluirFacturados}
              onChange={(e) => setIncluirFacturados(e.target.checked)}
            />
            Incluir ya facturados
          </label>
          <span className="topbar-spacer" style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => void exportar("csv")} disabled={exportando !== null}>
            <IconDownload width={15} height={15} /> {exportando === "csv" ? "Exportando…" : "CSV"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => void exportar("xlsx")} disabled={exportando !== null}>
            <IconDownload width={15} height={15} /> {exportando === "xlsx" ? "Exportando…" : "Excel"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => void exportar("pdf")} disabled={exportando !== null}>
            <IconDownload width={15} height={15} /> {exportando === "pdf" ? "Generando…" : "PDF con soportes"}
          </button>
        </div>
        <div className="cc-dias" style={{ marginTop: 8 }}>
          Archivo servicios_contrato_completo — alcance: todo el contrato ({itemsExportables.length} servicio(s) con el
          filtro actual). El reporte por escenario está en la vista Reportes.
        </div>
        {errorExport && <div style={{ color: "var(--high)", fontSize: 13, marginTop: 8 }}>{errorExport}</div>}
      </div>
    </>
  );
}
