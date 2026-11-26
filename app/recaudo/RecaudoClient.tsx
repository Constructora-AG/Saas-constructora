"use client";
import { useEffect, useMemo, useState } from "react";
import { DateRange, rangeFor, type Range } from "../DateRange";
import { IconCoins, IconCheck, IconWallet, IconChart } from "../icons";
import { CONCEPTOS, type Concepto, type EstadoCliente, type FilaCliente, type MesRecaudo } from "@/lib/recaudo/clientes";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-CO");
const fmtM = (n: number) => (Math.abs(n) >= 1e6 ? `$${NUM.format(Math.round(n / 1e6))} M` : COP.format(n));
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtMes = (m: string) => { const [y, mm] = m.split("-"); return `${MESES[+mm - 1]} ${y.slice(2)}`; };
/** Fecha local YYYY-MM-DD (sin el corrimiento de zona horaria de toISOString). */
const fechaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtFecha = (f: string | null) => (f ? `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : "—");
const porcentaje = (pagado: number, debe: number) => (debe > 0 ? Math.round((pagado / debe) * 100) : 0);

/** Estado del cliente frente a sus cuotas del período (texto + ícono, no solo color). */
const ESTADO: Record<EstadoCliente, { label: string; ico: string; cls: string }> = {
  pendiente: { label: "Pendiente", ico: "!", cls: "high" },
  adelantado: { label: "Pagó por adelantado", ico: "✓", cls: "ok" },
  al_dia: { label: "Al día", ico: "✓", cls: "ok" },
  sin_cuotas: { label: "Sin cuotas en el período", ico: "·", cls: "" },
};

interface TotalProyecto { proyecto: string; debe: number; yaPagado: number; pendiente: number; pagos: number; anticipos: number; mora: number }

export function RecaudoClient({ proyectos }: { proyectos: string[] }) {
  const [porCliente, setPorCliente] = useState<FilaCliente[]>([]);
  const [tendencia, setTendencia] = useState<MesRecaudo[]>([]);
  const [concepto, setConcepto] = useState<Concepto>("inicial");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proyecto, setProyecto] = useState("");
  const [range, setRange] = useState<Range>(() => rangeFor("mes"));
  const [mes, setMes] = useState("");

  function pickMes(v: string) {
    setMes(v);
    if (!v) return;
    const [y, m] = v.split("-").map(Number);
    setRange({ from: new Date(y, m - 1, 1, 0, 0, 0, 0), to: new Date(y, m, 0, 23, 59, 59, 999) });
  }

  // Todo el recaudo se calcula cuota por cuota en el servidor: cada pago se aplica a la
  // cuota que paga, así los anticipos no inflan un mes ni dejan deuda en otro.
  // Corte a hoy; sin fecha final, el período llega hasta hoy.
  const desdeCli = range.from ? fechaLocal(range.from) : null;
  const hastaCli = fechaLocal(range.to ?? new Date());
  useEffect(() => {
    let cancel = false;
    setCargando(true);
    setError(null);
    const qs = new URLSearchParams({ hasta: hastaCli, concepto, ...(desdeCli ? { desde: desdeCli } : {}) });
    fetch(`/api/recaudo/clientes?${qs}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { filas?: FilaCliente[]; tendencia?: MesRecaudo[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
        if (!cancel) { setPorCliente(body.filas ?? []); setTendencia(body.tendencia ?? []); }
      })
      .catch((e: unknown) => {
        if (!cancel) { setPorCliente([]); setTendencia([]); setError(e instanceof Error ? e.message : "No se pudo calcular el recaudo"); }
      })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desdeCli, hastaCli, concepto]);

  const clientes = useMemo(() => (proyecto ? porCliente.filter((c) => c.proyecto === proyecto) : porCliente), [porCliente, proyecto]);
  const filas = useMemo<TotalProyecto[]>(() => {
    const m = new Map<string, TotalProyecto>();
    for (const c of clientes) {
      const t = m.get(c.proyecto) ?? { proyecto: c.proyecto, debe: 0, yaPagado: 0, pendiente: 0, pagos: 0, anticipos: 0, mora: 0 };
      t.debe += c.debe; t.yaPagado += c.yaPagado; t.pendiente += c.pendiente;
      t.pagos += c.pagosPeriodo; t.anticipos += c.anticipos; t.mora += c.mora;
      m.set(c.proyecto, t);
    }
    return [...m.values()].filter((t) => t.debe > 0 || t.pagos > 0).sort((a, b) => b.debe - a.debe);
  }, [clientes]);
  const tot = useMemo(() => filas.reduce((a, p) => ({
    debe: a.debe + p.debe, yaPagado: a.yaPagado + p.yaPagado, pendiente: a.pendiente + p.pendiente,
    pagos: a.pagos + p.pagos, anticipos: a.anticipos + p.anticipos, mora: a.mora + p.mora,
  }), { debe: 0, yaPagado: 0, pendiente: 0, pagos: 0, anticipos: 0, mora: 0 }), [filas]);
  const pct = porcentaje(tot.yaPagado, tot.debe);
  const conceptoLabel = CONCEPTOS.find((c) => c.id === concepto)?.label ?? "";

  // Últimos 12 meses (hasta el mes del período), sumando los proyectos visibles.
  const ventana = useMemo(() => {
    const m = new Map<string, MesRecaudo>();
    for (const t of tendencia) {
      if (proyecto && t.proyecto !== proyecto) continue;
      const x = m.get(t.mes) ?? { mes: t.mes, proyecto: "", debe: 0, yaPagado: 0, pagos: 0, anticipos: 0 };
      x.debe += t.debe; x.yaPagado += t.yaPagado; x.pagos += t.pagos; x.anticipos += t.anticipos;
      m.set(t.mes, x);
    }
    return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }, [tendencia, proyecto]);
  const maxMes = Math.max(1, ...ventana.map((m) => m.debe));
  const desglose = [tot.anticipos > 0 && `${fmtM(tot.anticipos)} anticipos`, tot.mora > 0 && `${fmtM(tot.mora)} atrasadas`].filter(Boolean).join(" · ");

  return (
    <>
      <div className="toolbar">
        <label className="field">Proyecto
          <select value={proyecto} onChange={(e) => setProyecto(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field">Período a recaudar
          <DateRange defaultPreset="mes" onChange={(r) => { setRange(r); setMes(""); }} />
        </label>
        <label className="field">O ver un mes exacto
          <input type="month" className="input" value={mes} onChange={(e) => pickMes(e.target.value)} />
        </label>
        <label className="field">Concepto
          <select value={concepto} onChange={(e) => setConcepto(e.target.value as Concepto)}>
            {CONCEPTOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        {cargando && <span className="muted" style={{ fontSize: 13 }}>Calculando…</span>}
      </div>

      {error && (
        <div className="info-bar" role="alert" style={{ background: "var(--high-soft)", color: "var(--text)" }}>
          <IconChart /><div>No se pudo calcular el recaudo: {error}</div>
        </div>
      )}

      <div className="kpis" style={{ opacity: cargando && porCliente.length ? 0.6 : 1 }}>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico"><IconWallet /></span><span className="kpi-label">Debe recaudar</span></div><div className="kpi-value" style={{ fontSize: 21 }}>{error ? "—" : COP.format(tot.debe)}</div><div className="kpi-foot">cuotas que vencen en el período · {conceptoLabel.toLowerCase()}</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-ok"><IconCoins /></span><span className="kpi-label">Recaudado en caja</span></div><div className="kpi-value" style={{ fontSize: 21 }}>{error ? "—" : COP.format(tot.pagos)}</div><div className="kpi-foot">recibido en el período{desglose ? ` · incluye ${desglose}` : ""}</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-high"><IconChart /></span><span className="kpi-label">Pendiente</span></div><div className="kpi-value" style={{ fontSize: 21 }}>{error ? "—" : COP.format(tot.pendiente)}</div><div className="kpi-foot">de las cuotas del período, a hoy</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-ok"><IconCheck /></span><span className="kpi-label">Avance</span></div><div className="kpi-value">{error ? "—" : `${pct}%`}</div>
          <div className="bar-track" style={{ marginTop: 8 }} role="img" aria-label={`Avance ${pct} %`}><div className={`bar-fill${pct >= 100 ? " full" : ""}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
          <div className="kpi-foot">de las cuotas del período ya pagadas</div>
        </div>
      </div>

      <div className="charts-grid" style={{ marginTop: 22, opacity: cargando && porCliente.length ? 0.6 : 1 }}>
        <div className="chart-card">
          <div className="chart-title">Avance del período por proyecto</div>
          <div className="chart-sub">Pagado de las cuotas que vencen en el período, a hoy</div>
          {filas.length === 0 && <p className="muted">{cargando ? "Calculando…" : "Sin cuotas programadas en el período."}</p>}
          {filas.map((p) => {
            const pc = p.debe > 0 ? Math.min(100, (p.yaPagado / p.debe) * 100) : 0;
            return (
              <div key={p.proyecto} className="bar-row">
                <span className="bar-name" title={p.proyecto}>{p.proyecto}</span>
                <div className="bar-track"><div className={`bar-fill${pc >= 99.5 ? " full" : ""}`} style={{ width: `${pc}%` }} /></div>
                <span className="bar-val"><b>{fmtM(p.yaPagado)}</b><span className="bar-pct"> / {fmtM(p.debe)} · {Math.round(pc)}%</span></span>
              </div>
            );
          })}
        </div>

        <div className="chart-card">
          <div className="chart-title">Tendencia mensual</div>
          <div className="chart-sub">Cuotas que vencían cada mes y cuánto se ha pagado de ellas, a hoy · últimos 12 meses{proyecto ? ` · ${proyecto}` : ""}</div>
          <div className="chart-legend">
            <span><span className="legend-dot" style={{ background: "var(--brand-soft)" }} />Cuotas del mes</span>
            <span><span className="legend-dot" style={{ background: "var(--brand-600)" }} />Pagado de esas cuotas</span>
          </div>
          <div className="bars-month">
            {ventana.map((m) => {
              const th = (m.debe / maxMes) * 100;
              const fh = (Math.min(m.yaPagado, m.debe) / maxMes) * 100;
              const detalle = `${fmtMes(m.mes)} · cuotas ${fmtM(m.debe)} · pagado ${fmtM(m.yaPagado)} (${porcentaje(m.yaPagado, m.debe)} %) · en caja ese mes ${fmtM(m.pagos)}${m.anticipos > 0 ? `, de ellos ${fmtM(m.anticipos)} anticipos` : ""}`;
              return (
                <div key={m.mes} className="month-col" title={detalle} aria-label={detalle} role="img">
                  <div className="month-bar-wrap">
                    <div className="month-track" style={{ height: `${Math.max(2, th)}%` }}>
                      <div className="month-fill" style={{ height: `${th > 0 ? (fh / th) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className="month-lbl">{fmtMes(m.mes)}</span>
                </div>
              );
            })}
            {ventana.length === 0 && <p className="muted">{cargando ? "Calculando…" : "Sin datos."}</p>}
          </div>
        </div>
      </div>

      <div className="section-title">Detalle por proyecto</div>
      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead><tr>
            <th>Proyecto</th>
            <th style={{ textAlign: "right" }}>Debe recaudar</th>
            <th style={{ textAlign: "right" }}>Ya pagado</th>
            <th style={{ textAlign: "right" }}>Pendiente</th>
            <th style={{ textAlign: "right" }}>Recaudado en caja</th>
            <th style={{ textAlign: "right" }}>Avance</th>
          </tr></thead>
          <tbody>
            {filas.map((p) => {
              const pc = porcentaje(p.yaPagado, p.debe);
              return (
                <tr key={p.proyecto}>
                  <td><b>{p.proyecto}</b></td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(p.debe)}</td>
                  <td className="num" style={{ textAlign: "right", color: "var(--ok)" }}>{COP.format(p.yaPagado)}</td>
                  <td className="num" style={{ textAlign: "right", color: p.pendiente > 0 ? "var(--high)" : undefined }}>{COP.format(p.pendiente)}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {COP.format(p.pagos)}
                    {p.anticipos > 0 && <span className="cc-dias">incluye {COP.format(p.anticipos)} de anticipos</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>{p.debe > 0 ? <span className={`badge ${pc >= 99 ? "ok" : pc >= 60 ? "warn" : "high"}`}>{pc}%</span> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
            {filas.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 26 }}>{cargando ? "Calculando…" : "Sin cuotas en el período."}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section-title">Recaudo por cliente</div>
      <p className="muted" style={{ margin: "-4px 0 10px", fontSize: 12.5 }}>
        Cuotas que vencen en el período y cuánto falta hoy de ellas. Cada pago se aplica a la cuota que paga: un pago adelantado no deja deuda en el mes en que vence la cuota,
        y un pago a una cuota futura no cubre una cuota del período sin pagar. Concepto: {conceptoLabel.toLowerCase()}.
      </p>
      <div className="table-wrap table-scroll" style={{ opacity: cargando && porCliente.length ? 0.6 : 1 }}>
        <table className="clean tabla-compacta" aria-label="Recaudo por cliente" aria-busy={cargando} style={{ width: "100%" }}>
          <thead><tr>
            <th>Cliente</th>
            <th>Estado</th>
            <th style={{ textAlign: "right" }}>Debe pagar</th>
            <th style={{ textAlign: "right" }}>Ya pagado</th>
            <th style={{ textAlign: "right" }}>Pendiente hoy</th>
            <th style={{ textAlign: "right" }}>Pagos en el período</th>
            <th style={{ textAlign: "right" }}>Último pago</th>
          </tr></thead>
          <tbody>
            {clientes.map((c) => {
              const e = ESTADO[c.estado];
              const extra = [c.anticipos > 0 && `${COP.format(c.anticipos)} de cuotas futuras`, c.mora > 0 && `${COP.format(c.mora)} de cuotas atrasadas`].filter(Boolean).join(" · ");
              return (
                <tr key={c.prospectId}>
                  <td style={{ whiteSpace: "normal", minWidth: 170 }}><b>{c.cliente}</b><span className="cc-dias">{[c.unidad, c.proyecto].filter(Boolean).join(" · ")}</span></td>
                  <td>
                    <span className={`badge ${e.cls}`} style={e.cls ? undefined : { background: "var(--surface-2)", color: "var(--muted)" }}>
                      <span aria-hidden="true">{e.ico}</span> {e.label}
                    </span>
                    {c.anticipos > 0 && <span className="cc-dias">↗ adelantó cuotas</span>}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(c.debe)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(c.yaPagado)}</td>
                  <td className="num" style={{ textAlign: "right", color: c.pendiente > 0 ? "var(--high)" : undefined, fontWeight: c.pendiente > 0 ? 700 : undefined }}>{COP.format(c.pendiente)}</td>
                  <td className="num" style={{ textAlign: "right", whiteSpace: "normal", minWidth: 130 }}>
                    {COP.format(c.pagosPeriodo)}
                    {extra && <span className="cc-dias">incluye {extra}</span>}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>{fmtFecha(c.ultimoPago)}</td>
                </tr>
              );
            })}
            {clientes.length === 0 && !cargando && !error && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 26 }}>Sin cuotas ni pagos en el período.</td></tr>}
            {clientes.length === 0 && cargando && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 26 }}>Calculando…</td></tr>}
          </tbody>
          {clientes.length > 0 && (() => {
            const t = clientes.reduce((a, c) => ({ debe: a.debe + c.debe, pag: a.pag + c.yaPagado, pend: a.pend + c.pendiente, rec: a.rec + c.pagosPeriodo, ant: a.ant + c.anticipos }), { debe: 0, pag: 0, pend: 0, rec: 0, ant: 0 });
            const conPendiente = clientes.filter((c) => c.estado === "pendiente").length;
            return (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border, #ccc)", fontWeight: 700 }}>
                  <td>Totales <span className="cc-dias" style={{ fontWeight: 400 }}>{clientes.length} clientes</span></td>
                  <td className="muted" style={{ fontWeight: 400 }}>{conPendiente} con pendiente</td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(t.debe)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(t.pag)}</td>
                  <td className="num" style={{ textAlign: "right", color: t.pend > 0 ? "var(--high)" : undefined }}>{COP.format(t.pend)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(t.rec)}{t.ant > 0 && <span className="cc-dias" style={{ fontWeight: 400 }}>incluye {COP.format(t.ant)} de cuotas futuras</span>}</td>
                  <td />
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>
    </>
  );
}
