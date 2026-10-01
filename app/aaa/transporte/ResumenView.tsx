"use client";
// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Vista Resumen (SPEC §5.1)
// Línea de tiempo del contrato, 6 KPIs, ejecución mensual (divs CSS,
// sin Chart.js), alertas contractuales (computeAlertas) y exportación
// global CSV / Excel / PDF con soportes vía lib/transporte/export.ts
// (módulo compartido con Registros y Reportes).
// ════════════════════════════════════════════════════════════════════

import { Fragment, useMemo, useState } from "react";
import {
  IconAlert,
  IconChart,
  IconCheck,
  IconCoins,
  IconDownload,
  IconTruck,
  IconWallet,
} from "../../icons";
import { CONTRATANTE, CONTRATISTA, CONTRATO_EMERGENCIA, FICHA_MODULO } from "@/lib/transporte/constants";
import {
  ALERTAS_MAX,
  ALERTAS_VACIO,
  collectAllItems,
  computeAlertas,
  fmtMes,
  fmtShort,
  totales,
  totalesContratista,
  fdate,
} from "@/lib/transporte/logic";
import { num, type Servicio } from "@/lib/transporte/model";
import { exportServicios, type ExportFormat } from "@/lib/transporte/export";
import type { ViewProps } from "@/lib/transporte/useTransporte";

const fFechaIso = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

// ── Barra horizontal de progreso (patrón AaaClient/RecaudoClient) ──

function Bar({ label, value, total, pctLabel, valText }: { label: string; value: number; total: number; pctLabel: string; valText?: string }) {
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
        <b>{valText ?? fmtShort(value)}</b>
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

  // Contrato de Alquiler: la ejecución es el día a día de la pestaña Registros.
  // Alquiler / Emergencia: módulos de registros (cada uno con sus propios datos).
  const ficha = FICHA_MODULO[t.ns];
  const esAlquiler = ficha.registros;

  // KPIs (fórmulas SPEC §5.1)
  // Alquiler / Emergencia: el contrato es con IVA → ejecutado = base + IVA de cada registro
  // (los creados desde facturas AGF ya traen el total con IVA en value y sin valorIva).
  const valorConIva = (s: Servicio) => num(s.value) + (esAlquiler ? num(s.valorIva) : 0);
  const valorEjecutado = esAlquiler ? allItems.reduce((acc, s) => acc + valorConIva(s), 0) : tot.valor;
  const valorContrato = t.contractValue;                      // propio del módulo (0 = sin definir)
  const hayValor = valorContrato > 0;
  const pctValor = hayValor ? (valorEjecutado / valorContrato) * 100 : 0;
  const saldo = valorContrato - valorEjecutado;              // valor del contrato − Σ value
  const saldoBajo = hayValor && saldo < valorContrato * 0.1; // warn si saldo < 10% del contrato
  const totalPeajes = tot.peajes;                            // Σ tolls
  const servicios = tot.servicios;                           // count
  const sinSoporte = tot.sinSoporte;                         // count(!photo || !approved)

  // Alertas contractuales (§4.9), máximo 8
  const alertas = useMemo(
    () => computeAlertas(t.servicesByMonth, t.admin, new Date(), valorContrato).slice(0, ALERTAS_MAX),
    [t.servicesByMonth, t.admin, valorContrato],
  );

  // Ejecución mensual: barra = ejecutado del mes, track = presupuesto promedio
  const presupuestoMes = t.allMonths.length > 0 ? valorContrato / t.allMonths.length : 0;
  const ejecucionTransporte = useMemo(
    () =>
      t.months.map((m) => ({
        key: m.key,
        label: m.label,
        real: (t.servicesByMonth[m.key] ?? []).reduce((acc, s) => acc + num(s.value), 0),
      })),
    [t.months, t.servicesByMonth],
  );

  // Alquiler: meses desde el primer registro hasta el mes actual (o el último registro).
  const alq = useMemo(() => {
    const porMes = new Map<string, number>();
    for (const s of allItems) {
      const k = s.date.slice(0, 7);
      porMes.set(k, (porMes.get(k) ?? 0) + valorConIva(s));
    }
    const claves = [...porMes.keys()].sort();
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    const meses: Array<{ key: string; label: string; real: number }> = [];
    if (claves.length > 0) {
      const fin = claves[claves.length - 1] > mesActual ? claves[claves.length - 1] : mesActual;
      let [y, m] = claves[0].split("-").map(Number);
      for (let k = claves[0]; k <= fin; k = `${y}-${String(m).padStart(2, "0")}`) {
        meses.push({ key: k, label: fmtMes(k), real: porMes.get(k) ?? 0 });
        if (++m > 12) { m = 1; y++; }
      }
    }
    const ordenados = [...allItems].sort((a, b) => a.date.localeCompare(b.date) || String(a.orderNo).localeCompare(String(b.orderNo), "es", { numeric: true }));
    return {
      meses,
      mesActual: porMes.get(mesActual) ?? 0,
      promedioMes: meses.length > 0 ? valorEjecutado / meses.length : 0,
      primero: ordenados[0] ?? null,
      ultimo: ordenados[ordenados.length - 1] ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, valorEjecutado]);

  const ejecucionMensual = esAlquiler ? alq.meses : ejecucionTransporte;

  // Transporte AAA — dinero en contratistas (uso interno) con corte a una fecha:
  // valor ejecutado y costo neto de los servicios hechos hasta ese día.
  const [corte, setCorte] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const contr = useMemo(() => totalesContratista(allItems, t.tarifario, t.tarifarioCosto, corte || undefined), [allItems, t.tarifario, t.tarifarioCosto, corte]);
  // Detalle por contratista (propietario de la placa en Flota), desplegable por placa.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const porContratista = useMemo(() => {
    if (t.ns !== "transporte") return [];
    const normPlaca = (p: string) => p.trim().toUpperCase().replace(/[\s-]/g, "");
    const contratistaDe = new Map((t.admin?.vehiculos ?? []).filter((v) => v.contratista?.trim()).map((v) => [normPlaca(v.plate), v.contratista!.trim()]));
    const grupos = new Map<string, { asignado: boolean; placas: Map<string, Servicio[]> }>();
    for (const sv of allItems) {
      if (corte && sv.date > corte) continue;
      const placa = normPlaca(sv.plate || "") || "SIN PLACA";
      const c = contratistaDe.get(placa);
      const nombre = c ?? "__sin__";
      const g = grupos.get(nombre) ?? { asignado: !!c, placas: new Map<string, Servicio[]>() };
      g.placas.set(placa, [...(g.placas.get(placa) ?? []), sv]);
      grupos.set(nombre, g);
    }
    return [...grupos.entries()]
      .map(([nombre, g]) => {
        const placas = [...g.placas.entries()]
          .map(([placa, items]) => ({ placa, tot: totalesContratista(items, t.tarifario, t.tarifarioCosto) }))
          .sort((a, b) => b.tot.costo - a.tot.costo);
        const tot = totalesContratista([...g.placas.values()].flat(), t.tarifario, t.tarifarioCosto);
        return { nombre, asignado: g.asignado, placas, tot };
      })
      .sort((a, b) => Number(b.asignado) - Number(a.asignado) || b.tot.costo - a.tot.costo);
  }, [t.ns, t.admin, allItems, corte, t.tarifario, t.tarifarioCosto]);

  const contrMeses = useMemo(
    () =>
      t.ns !== "transporte" ? [] :
      t.months
        .map((m) => ({ key: m.key, label: m.label, tot: totalesContratista(t.servicesByMonth[m.key] ?? [], t.tarifario, t.tarifarioCosto, corte || undefined) }))
        .filter((m) => m.tot.servicios > 0)
        .reduce<Array<{ key: string; label: string; tot: ReturnType<typeof totalesContratista>; acumulado: number }>>(
          (acc, m) => [...acc, { ...m, acumulado: (acc[acc.length - 1]?.acumulado ?? 0) + m.tot.costo }], []),
    [t.ns, t.months, t.servicesByMonth, t.tarifario, t.tarifarioCosto, corte],
  );
  const referenciaMes = esAlquiler ? alq.promedioMes : presupuestoMes;
  const maxMes = Math.max(1, referenciaMes, ...ejecucionMensual.map((m) => m.real));

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
      valorContrato,
      ns: t.ns,
      tarifario: t.ns === "transporte" ? t.tarifario : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t.contractStart, t.contractEndExclusive, valorEjecutado, valorContrato, t.ns, t.tarifario],
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
          <span className="estado-val">{ficha.numero}</span>
          {esAlquiler && <span className="estado-sub">{ficha.objeto}</span>}
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
          Tiempo transcurrido: {t.status.pctTiempo.toFixed(1)}%
          {hayValor ? ` · Valor ejecutado: ${Math.min(100, pctValor).toFixed(1)}%` : " · Valor del contrato sin definir (Administración → Vigencia y valor del contrato)"}
        </div>
        <Bar
          label="Tiempo transcurrido"
          value={t.status.pctTiempo}
          total={100}
          valText={t.status.label.split(" · ")[0]}
          pctLabel="del plazo"
        />
        {hayValor && <Bar label="Valor ejecutado" value={valorEjecutado} total={valorContrato} pctLabel="del contrato" />}
      </div>

      {esAlquiler ? (
        <>
      {/* Indicadores del Contrato de Alquiler: todo sale de los registros */}
      <div className="section-title">Indicadores del contrato</div>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico s-ok"><IconChart /></span>
            <span className="kpi-label">Valor ejecutado</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(valorEjecutado)}</div>
          <div className="kpi-foot">
            Suma de {tot.servicios.toLocaleString("es-CO")} registro(s){hayValor ? ` · ${pctValor.toFixed(1)}% del contrato` : ""}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico s-brand"><IconWallet /></span>
            <span className="kpi-label">Valor del contrato</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{hayValor ? COP.format(valorContrato) : "Sin definir"}</div>
          <div className="kpi-foot">{hayValor ? (t.ns === "alquiler" ? "IVA incluido (Cláusula Tercera)" : "IVA incluido") : "Defínelo en Administración"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className={`kpi-ico${saldoBajo ? " s-warn" : ""}`}><IconCoins /></span>
            <span className="kpi-label">Saldo disponible</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19, color: saldoBajo ? "var(--warn)" : undefined }}>
            {hayValor ? COP.format(saldo) : "—"}
          </div>
          <div className="kpi-foot">Valor del contrato − ejecutado</div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico s-brand"><IconTruck /></span>
            <span className="kpi-label">Registros</span>
          </div>
          <div className="kpi-value">{tot.servicios.toLocaleString("es-CO")}</div>
          <div className="kpi-foot">
            {alq.primero && alq.ultimo ? `${fFechaIso(alq.primero.date)} — ${fFechaIso(alq.ultimo.date)}` : "Sin registros"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico s-brand"><IconWallet /></span>
            <span className="kpi-label">Ejecutado este mes</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(alq.mesActual)}</div>
          <div className="kpi-foot">{fmtMes(new Date().toISOString().slice(0, 7))}</div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico"><IconCoins /></span>
            <span className="kpi-label">Promedio mensual</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(alq.promedioMes)}</div>
          <div className="kpi-foot">{alq.meses.length} mes(es) desde el primer registro</div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico s-ok"><IconCheck /></span>
            <span className="kpi-label">Último registro</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{alq.ultimo ? COP.format(valorConIva(alq.ultimo)) : "—"}</div>
          <div className="kpi-foot">{alq.ultimo ? `${[alq.ultimo.orderNo, alq.ultimo.facturaAGF].filter(Boolean).join(" · ")} · ${fFechaIso(alq.ultimo.date)}` : "Sin registros"}</div>
        </div>
      </div>

        </>
      ) : (
        <>
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
            <span className="kpi-ico s-brand"><IconWallet /></span>
            <span className="kpi-label">Valor del contrato</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{hayValor ? COP.format(valorContrato) : "Sin definir"}</div>
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
            <span className="kpi-ico s-warn"><IconCoins /></span>
            <span className="kpi-label">Total peajes</span>
          </div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(totalPeajes)}</div>
          <div className="kpi-foot">A cargo del contratista</div>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="kpi-ico s-brand"><IconTruck /></span>
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

        </>
      )}

      {/* Transporte AAA — pago a contratistas (USO INTERNO: no va en PDF ni exportaciones) */}
      {t.ns === "transporte" && (
        <>
          <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span>Dinero en contratistas <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· uso interno</span></span>
            <span style={{ flex: 1 }} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0, fontWeight: 400, fontSize: 13 }}>
              Corte al
              <input className="input" type="date" value={corte} onChange={(e) => setCorte(e.target.value)} style={{ width: 160 }} />
            </label>
          </div>
          <div className="kpis">
            <div className="kpi">
              <div className="kpi-head"><span className="kpi-ico s-ok"><IconChart /></span><span className="kpi-label">Valor ejecutado al corte</span></div>
              <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(contr.ingreso)}</div>
              <div className="kpi-foot">{contr.servicios.toLocaleString("es-CO")} servicio(s) hasta el {fdate(corte)}</div>
              <div className="kpi-foot" style={{ marginTop: 6, fontStyle: "italic" }}>Qué es: lo que se le cobra a Triple A por los servicios hechos hasta la fecha de corte (tarifas del pliego).</div>
            </div>
            <div className="kpi">
              <div className="kpi-head"><span className="kpi-ico s-brand"><IconCoins /></span><span className="kpi-label">Saldo del contrato al corte</span></div>
              <div className="kpi-value" style={{ fontSize: 19 }}>{hayValor ? COP.format(valorContrato - contr.ingreso) : "—"}</div>
              <div className="kpi-foot">{hayValor ? `Valor del contrato ${COP.format(valorContrato)} − ejecutado` : "Valor del contrato sin definir"}</div>
              <div className="kpi-foot" style={{ marginTop: 6, fontStyle: "italic" }}>Qué es: cuánto queda del contrato por ejecutar a la fecha de corte.</div>
            </div>
            <div className="kpi">
              <div className="kpi-head"><span className="kpi-ico s-brand"><IconWallet /></span><span className="kpi-label">Dinero en contratistas al corte</span></div>
              <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(contr.costo)}</div>
              <div className="kpi-foot">
                {contr.ingreso > 0 ? `${((contr.costo / contr.ingreso) * 100).toFixed(1)}% del valor ejecutado` : "—"}{contr.sinCosto > 0 ? ` · ${contr.sinCosto} servicio(s) sin costo` : ""}
              </div>
              <div className="kpi-foot" style={{ marginTop: 6, fontStyle: "italic" }}>Qué es: el dinero neto que AG le paga a sus contratistas por esos mismos servicios (tarifa de costo de cada ruta + recargos).</div>
            </div>
            <div className="kpi">
              <div className="kpi-head"><span className="kpi-ico s-ok"><IconChart /></span><span className="kpi-label">Margen bruto</span></div>
              <div className="kpi-value" style={{ fontSize: 19, color: contr.margen < 0 ? "var(--high)" : undefined }}>{COP.format(contr.margen)}</div>
              <div className="kpi-foot">{contr.ingreso > 0 ? `${((contr.margen / contr.ingreso) * 100).toFixed(1)}% del valor ejecutado` : "—"}</div>
              <div className="kpi-foot" style={{ marginTop: 6, fontStyle: "italic" }}>Qué es: lo que le queda a AG por el transporte antes de sus otros gastos (peajes, administración, impuestos): valor ejecutado − dinero en contratistas.</div>
            </div>
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="clean" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th style={{ textAlign: "right" }}>Servicios</th>
                  <th style={{ textAlign: "right" }}>Valor ejecutado</th>
                  <th style={{ textAlign: "right" }}>En contratistas</th>
                  <th style={{ textAlign: "right" }}>Acumulado en contratistas</th>
                  <th style={{ textAlign: "right" }}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {contrMeses.map((m) => (
                  <tr key={m.key}>
                    <td><b>{m.label}</b></td>
                    <td className="num" style={{ textAlign: "right" }}>{m.tot.servicios.toLocaleString("es-CO")}</td>
                    <td className="num" style={{ textAlign: "right" }}>{COP.format(m.tot.ingreso)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{COP.format(m.tot.costo)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{COP.format(m.acumulado)}</td>
                    <td className="num" style={{ textAlign: "right", color: m.tot.margen < 0 ? "var(--high)" : undefined }}>
                      {COP.format(m.tot.margen)}{m.tot.ingreso > 0 ? <span className="muted"> · {((m.tot.margen / m.tot.ingreso) * 100).toFixed(1)}%</span> : null}
                    </td>
                  </tr>
                ))}
                {contrMeses.length === 0 && <tr><td colSpan={6} className="muted">Aún no hay servicios registrados.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Por mes, hasta la fecha de corte: <b>En contratistas</b> = dinero neto a contratistas de los servicios del mes ·{" "}
            <b>Acumulado</b> = suma desde el inicio del contrato · <b>Margen</b> = valor ejecutado − en contratistas.
          </div>

          <div className="section-title">Detalle por contratista <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· al {fdate(corte)}</span></div>
          <div className="table-wrap table-scroll">
            <table className="clean" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Contratista</th>
                  <th>Placas</th>
                  <th style={{ textAlign: "right" }}>Servicios</th>
                  <th style={{ textAlign: "right" }}>Valor ejecutado</th>
                  <th style={{ textAlign: "right" }}>En contratista</th>
                  <th style={{ textAlign: "right" }}>% del dinero en contratistas</th>
                  <th style={{ textAlign: "right" }}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {porContratista.map((g) => (
                  <Fragment key={g.nombre}>
                    <tr style={{ cursor: "pointer" }} onClick={() => setAbiertos((p) => { const n = new Set(p); if (n.has(g.nombre)) n.delete(g.nombre); else n.add(g.nombre); return n; })}>
                      <td>
                        <span className="muted" style={{ display: "inline-block", width: 14 }}>{abiertos.has(g.nombre) ? "▾" : "▸"}</span>
                        <b>{g.asignado ? g.nombre : "Sin contratista asignado"}</b>
                        {!g.asignado && <span className="cc-dias"> · asígnalo a la placa en Flota</span>}
                      </td>
                      <td>{g.placas.map((p) => p.placa).join(", ")}</td>
                      <td className="num" style={{ textAlign: "right" }}>{g.tot.servicios.toLocaleString("es-CO")}</td>
                      <td className="num" style={{ textAlign: "right" }}>{COP.format(g.tot.ingreso)}</td>
                      <td className="num" style={{ textAlign: "right" }}><b>{COP.format(g.tot.costo)}</b></td>
                      <td className="num" style={{ textAlign: "right" }}>{contr.costo > 0 ? `${((g.tot.costo / contr.costo) * 100).toFixed(1)}%` : "—"}</td>
                      <td className="num" style={{ textAlign: "right", color: g.tot.margen < 0 ? "var(--high)" : undefined }}>{COP.format(g.tot.margen)}</td>
                    </tr>
                    {abiertos.has(g.nombre) && g.placas.map((p) => (
                      <tr key={`${g.nombre}|${p.placa}`} style={{ background: "var(--surface-2)" }}>
                        <td style={{ paddingLeft: 30 }} className="muted">Placa</td>
                        <td>{p.placa}</td>
                        <td className="num" style={{ textAlign: "right" }}>{p.tot.servicios.toLocaleString("es-CO")}</td>
                        <td className="num" style={{ textAlign: "right" }}>{COP.format(p.tot.ingreso)}</td>
                        <td className="num" style={{ textAlign: "right" }}>{COP.format(p.tot.costo)}</td>
                        <td className="num" style={{ textAlign: "right" }}>{contr.costo > 0 ? `${((p.tot.costo / contr.costo) * 100).toFixed(1)}%` : "—"}</td>
                        <td className="num" style={{ textAlign: "right" }}>{COP.format(p.tot.margen)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {porContratista.length === 0 && <tr><td colSpan={7} className="muted">Aún no hay servicios hasta esta fecha.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Haz clic en un contratista para ver sus placas. El contratista de cada placa se asigna en <b>Flota</b>.{" "}
            <b>% del dinero en contratistas</b> = parte del total que va a ese contratista.
          </div>
        </>
      )}

      {/* Otro Sí / Emergencia: alcance contratado por área (Cláusula Cuarta) */}
      {t.ns === "emergencia" && (
        <div className="chart-card" style={{ marginTop: 18 }}>
          <div className="chart-title">Alcance contratado por área</div>
          <div className="chart-sub">
            Cláusula Cuarta · {CONTRATO_EMERGENCIA.modalidad} · servicio a todo costo (volquetas con conductor, combustible y
            peajes) · destino: relleno sanitario Parque Ambiental Los Pocitos · solo se pagan horas efectivas
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="clean" style={{ width: "100%" }}>
              <thead>
                <tr><th>Área solicitante</th><th>Servicio</th><th style={{ textAlign: "right" }}>Cantidad contratada</th></tr>
              </thead>
              <tbody>
                {CONTRATO_EMERGENCIA.alcance.map((x) => (
                  <tr key={x.area}>
                    <td><b>{x.area}</b></td>
                    <td>{x.servicio}</td>
                    <td className="num" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{x.cantidad.toLocaleString("es-CO")} {x.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ejecución mensual — divs CSS (patrón bars-month), sin Chart.js */}
      <div className="chart-card" style={{ marginTop: 18 }}>
        <div className="chart-title">Ejecución mensual ({esAlquiler ? "suma de registros" : "valor facturado"})</div>
        <div className="chart-sub">
          {ejecucionMensual.length > 0 ? `${ejecucionMensual[0].label} — ${ejecucionMensual[ejecucionMensual.length - 1].label}` : "—"} · barra =
          ejecutado del mes · fondo = {esAlquiler ? "promedio mensual ejecutado" : "presupuesto mensual promedio"} ({fmtShort(referenciaMes)})
        </div>
        <div className="chart-legend">
          <span><span className="legend-dot" style={{ background: "var(--brand-soft)" }} />{esAlquiler ? "Promedio mensual" : "Presupuesto promedio mensual"}</span>
          <span><span className="legend-dot" style={{ background: "var(--brand-600)" }} />Ejecutado</span>
        </div>
        <div className="bars-month">
          {ejecucionMensual.map((m) => {
            const th = (Math.max(referenciaMes, m.real) / maxMes) * 100;   // altura del track
            const fh = th > 0 ? ((m.real / maxMes) * 100 / th) * 100 : 0;   // fill en % del track
            return (
              <div
                key={m.key}
                className="month-col"
                title={`${m.label} · ejecutado ${COP.format(m.real)} · ${esAlquiler ? "promedio" : "presupuesto"} ${COP.format(referenciaMes)}`}
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
