"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DateRange, rangeFor, type Range } from "../DateRange";
import { IconCoins, IconCheck, IconWallet, IconChart } from "../icons";

interface Proj { proyecto: string; programado: number; recaudado: number; cuotas: number; }
interface Mes { mes: string; programado: number; recaudado: number; }
interface Cli { prospectId: string; cliente: string; proyecto: string; programado: number; recaudado: number; abonos: number; ultimoPago: string | null; }

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-CO");
const fmtM = (n: number) => (Math.abs(n) >= 1e6 ? `$${NUM.format(Math.round(n / 1e6))} M` : COP.format(n));
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtMes = (m: string) => { const [y, mm] = m.split("-"); return `${MESES[+mm - 1]} ${y.slice(2)}`; };
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function RecaudoClient({ proyectos }: { proyectos: string[] }) {
  const [porProy, setPorProy] = useState<Proj[]>([]);
  const [mensual, setMensual] = useState<Mes[]>([]);
  const [porCliente, setPorCliente] = useState<Cli[]>([]);
  const [loading, setLoading] = useState(true);
  const [proyecto, setProyecto] = useState("");
  const [range, setRange] = useState<Range>(() => rangeFor("mes"));
  const [mes, setMes] = useState("");

  function pickMes(v: string) {
    setMes(v);
    if (!v) return;
    const [y, m] = v.split("-").map(Number);
    setRange({ from: new Date(y, m - 1, 1, 0, 0, 0, 0), to: new Date(y, m, 0, 23, 59, 59, 999) });
  }

  useEffect(() => {
    const supa = supabaseBrowser();
    if (!supa) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const desde = iso(range.from);
      const hasta = iso(range.to);
      let qCuotas = supa.from("sh_cuotas").select("prospect_id, project_name, programado").range(0, 4999);
      let qAbonos = supa.from("sh_abonos").select("prospect_id, project_name, monto, fecha").range(0, 4999);
      if (desde) { qCuotas = qCuotas.gte("fecha", desde); qAbonos = qAbonos.gte("fecha", desde); }
      if (hasta) { qCuotas = qCuotas.lte("fecha", hasta); qAbonos = qAbonos.lte("fecha", hasta); }
      const [{ data: pp }, { data: mm }, { data: cu }, { data: ab }, { data: ca }] = await Promise.all([
        supa.rpc("recaudo_por_proyecto", { desde, hasta }),
        supa.rpc("recaudo_mensual", { proj: proyecto || null }),
        qCuotas,
        qAbonos,
        supa.from("cartera").select("prospect_id, cliente").range(0, 4999),
      ]);
      if (cancel) return;
      setPorProy((pp ?? []) as Proj[]);
      setMensual((mm ?? []) as Mes[]);

      // Consolida programado + pagado por cliente en el período.
      const nombres = new Map<string, string>((ca ?? []).map((r: any) => [r.prospect_id, r.cliente ?? ""]));
      const map = new Map<string, Cli>();
      const fila = (pid: string, proy: string) => {
        let c = map.get(pid);
        if (!c) {
          c = { prospectId: pid, cliente: nombres.get(pid) || pid.slice(0, 8), proyecto: proy, programado: 0, recaudado: 0, abonos: 0, ultimoPago: null };
          map.set(pid, c);
        }
        return c;
      };
      for (const r of (cu ?? []) as any[]) fila(r.prospect_id, r.project_name).programado += r.programado ?? 0;
      for (const r of (ab ?? []) as any[]) {
        const c = fila(r.prospect_id, r.project_name);
        c.recaudado += r.monto ?? 0;
        c.abonos += 1;
        if (r.fecha && (!c.ultimoPago || r.fecha > c.ultimoPago)) c.ultimoPago = r.fecha;
      }
      setPorCliente([...map.values()].sort((a, b) => b.recaudado - a.recaudado || b.programado - a.programado));
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [range, proyecto]);

  const filas = useMemo(() => (proyecto ? porProy.filter((p) => p.proyecto === proyecto) : porProy), [porProy, proyecto]);
  const clientes = useMemo(() => (proyecto ? porCliente.filter((c) => c.proyecto === proyecto) : porCliente), [porCliente, proyecto]);
  const tot = useMemo(() => filas.reduce((a, p) => ({ prog: a.prog + p.programado, rec: a.rec + p.recaudado }), { prog: 0, rec: 0 }), [filas]);
  const pct = tot.prog > 0 ? Math.round((tot.rec / tot.prog) * 100) : 0;
  const maxProg = Math.max(1, ...filas.map((p) => p.programado));

  // Últimos 12 meses hasta el mes seleccionado (o el actual).
  const ventana = useMemo(() => {
    const hastaMes = range.to ? range.to.toISOString().slice(0, 7) : mensual[mensual.length - 1]?.mes ?? "";
    const hasta = mensual.filter((m) => !hastaMes || m.mes <= hastaMes);
    return hasta.slice(-12);
  }, [mensual, range]);
  const maxMes = Math.max(1, ...ventana.map((m) => m.programado));

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
        {loading && <span className="muted" style={{ fontSize: 13 }}>Calculando…</span>}
      </div>

      <div className="kpis">
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico"><IconWallet /></span><span className="kpi-label">Debe recaudar</span></div><div className="kpi-value" style={{ fontSize: 21 }}>{COP.format(tot.prog)}</div><div className="kpi-foot">cuotas del cliente del período</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-ok"><IconCoins /></span><span className="kpi-label">Recaudado</span></div><div className="kpi-value" style={{ fontSize: 21 }}>{COP.format(tot.rec)}</div><div className="kpi-foot">recibido en el período</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-high"><IconChart /></span><span className="kpi-label">Pendiente</span></div><div className="kpi-value" style={{ fontSize: 21 }}>{COP.format(Math.max(0, tot.prog - tot.rec))}</div><div className="kpi-foot">por recaudar del período</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-ok"><IconCheck /></span><span className="kpi-label">Avance</span></div><div className="kpi-value">{pct}%</div>
          <div className="bar-track" style={{ marginTop: 8 }}><div className={`bar-fill${pct >= 100 ? " full" : ""}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
        </div>
      </div>

      <div className="charts-grid" style={{ marginTop: 22 }}>
        <div className="chart-card">
          <div className="chart-title">Recaudo del período por proyecto</div>
          <div className="chart-sub">Recaudado vs. programado en el período seleccionado</div>
          {filas.length === 0 && <p className="muted">Sin cuotas programadas en el período.</p>}
          {filas.map((p) => {
            const pc = p.programado > 0 ? Math.min(100, (p.recaudado / p.programado) * 100) : 0;
            return (
              <div key={p.proyecto} className="bar-row">
                <span className="bar-name" title={p.proyecto}>{p.proyecto}</span>
                <div className="bar-track"><div className={`bar-fill${pc >= 99.5 ? " full" : ""}`} style={{ width: `${pc}%` }} /></div>
                <span className="bar-val"><b>{fmtM(p.recaudado)}</b><span className="bar-pct"> / {fmtM(p.programado)} · {Math.round(pc)}%</span></span>
              </div>
            );
          })}
        </div>

        <div className="chart-card">
          <div className="chart-title">Tendencia mensual del recaudo</div>
          <div className="chart-sub">Últimos 12 meses{proyecto ? ` · ${proyecto}` : ""}</div>
          <div className="chart-legend">
            <span><span className="legend-dot" style={{ background: "var(--brand-soft)" }} />Programado</span>
            <span><span className="legend-dot" style={{ background: "var(--brand-600)" }} />Recaudado</span>
          </div>
          <div className="bars-month">
            {ventana.map((m) => {
              const th = (m.programado / maxMes) * 100;
              const fh = (Math.min(m.recaudado, m.programado) / maxMes) * 100;
              return (
                <div key={m.mes} className="month-col" title={`${fmtMes(m.mes)} · prog ${fmtM(m.programado)} · recaud ${fmtM(m.recaudado)}`}>
                  <div className="month-bar-wrap">
                    <div className="month-track" style={{ height: `${Math.max(2, th)}%` }}>
                      <div className="month-fill" style={{ height: `${th > 0 ? (fh / th) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className="month-lbl">{fmtMes(m.mes)}</span>
                </div>
              );
            })}
            {ventana.length === 0 && <p className="muted">Sin datos.</p>}
          </div>
        </div>
      </div>

      <div className="section-title">Detalle por proyecto</div>
      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead><tr>
            <th>Proyecto</th>
            <th style={{ textAlign: "right" }}>Debe recaudar</th>
            <th style={{ textAlign: "right" }}>Recaudado</th>
            <th style={{ textAlign: "right" }}>Pendiente</th>
            <th style={{ textAlign: "right" }}>Avance</th>
          </tr></thead>
          <tbody>
            {filas.map((p) => {
              const pc = p.programado > 0 ? Math.round((p.recaudado / p.programado) * 100) : 0;
              return (
                <tr key={p.proyecto}>
                  <td><b>{p.proyecto}</b></td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(p.programado)}</td>
                  <td className="num" style={{ textAlign: "right", color: "var(--ok)" }}>{COP.format(p.recaudado)}</td>
                  <td className="num" style={{ textAlign: "right", color: "var(--high)" }}>{COP.format(Math.max(0, p.programado - p.recaudado))}</td>
                  <td style={{ textAlign: "right" }}><span className={`badge ${pc >= 99 ? "ok" : pc >= 60 ? "warn" : "high"}`}>{pc}%</span></td>
                </tr>
              );
            })}
            {filas.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 26 }}>Sin cuotas en el período.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section-title">Recaudo por cliente</div>
      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead><tr>
            <th>Cliente</th>
            <th>Proyecto</th>
            <th style={{ textAlign: "right" }}>Debe pagar</th>
            <th style={{ textAlign: "right" }}>Pagó</th>
            <th style={{ textAlign: "right" }}>Pendiente</th>
            <th style={{ textAlign: "right" }}>Abonos</th>
            <th style={{ textAlign: "right" }}>Último pago</th>
          </tr></thead>
          <tbody>
            {clientes.map((c) => {
              const pend = Math.max(0, c.programado - c.recaudado);
              return (
                <tr key={c.prospectId}>
                  <td><b>{c.cliente}</b></td>
                  <td className="muted">{c.proyecto}</td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(c.programado)}</td>
                  <td className="num" style={{ textAlign: "right", color: c.recaudado > 0 ? "var(--ok)" : undefined }}>{COP.format(c.recaudado)}</td>
                  <td className="num" style={{ textAlign: "right", color: pend > 0 ? "var(--high)" : undefined }}>{COP.format(pend)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{c.abonos}</td>
                  <td className="num" style={{ textAlign: "right" }}>{c.ultimoPago ?? "—"}</td>
                </tr>
              );
            })}
            {clientes.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 26 }}>Sin movimientos en el período.</td></tr>}
          </tbody>
          {clientes.length > 0 && (() => {
            const t = clientes.reduce((a, c) => ({ prog: a.prog + c.programado, rec: a.rec + c.recaudado, ab: a.ab + c.abonos }), { prog: 0, rec: 0, ab: 0 });
            return (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border, #ccc)", fontWeight: 700 }}>
                  <td>Totales</td>
                  <td className="muted">{clientes.length} clientes</td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(t.prog)}</td>
                  <td className="num" style={{ textAlign: "right", color: "var(--ok)" }}>{COP.format(t.rec)}</td>
                  <td className="num" style={{ textAlign: "right", color: t.prog - t.rec > 0 ? "var(--high)" : undefined }}>{COP.format(Math.max(0, t.prog - t.rec))}</td>
                  <td className="num" style={{ textAlign: "right" }}>{t.ab}</td>
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
