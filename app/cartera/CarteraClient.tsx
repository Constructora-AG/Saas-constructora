"use client";
import { useEffect, useMemo, useState } from "react";
import { BitacoraClient } from "../cobranza/BitacoraClient";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Semaforo } from "@/lib/cartera/compute";
import { plantillaCobro, waLink } from "@/lib/cartera/whatsapp";
import { IconCoins, IconAlert, IconChart, IconCheck, IconWhatsApp, IconWallet } from "../icons";
import { DateRange, inRange, rangeFor, type Range } from "../DateRange";

export interface CarteraRow {
  prospect_id: string;
  project_name: string;
  module: string;
  cliente: string;
  celular: string;
  saldo: number;
  monto_en_mora: number;
  mora_inicial: number;
  mora_credito: number;
  cuotas_vencidas: number;
  dias_mora: number;
  semaforo: Semaforo;
  proxima_cuota_fecha: string | null;
  estado: string;
  ultima_gestion_at: string | null;
  ultimo_canal: string | null;
}
export interface Cobrador { id: string; nombre: string; }

const ESTADO_LABEL: Record<string, string> = {
  sin_gestion: "Sin gestionar",
  contactado: "Contactado",
  promesa_pago: "Promesa de pago",
  acuerdo_pago: "Acuerdo de pago",
  incumplido: "Incumplió",
  juridico: "Cobro jurídico",
  desistido: "Desistió",
  al_dia: "Al día",
};

// Acciones de cobranza que registra el equipo de cartera.
interface Accion { key: string; label: string; canal: string; tipo: string; resultado: string | null; estado: string | null; }
const ACCIONES: Accion[] = [
  { key: "contactado", label: "Contactado", canal: "llamada", tipo: "contacto", resultado: "contesto", estado: "contactado" },
  { key: "no_contesta", label: "No contesta", canal: "llamada", tipo: "contacto", resultado: "no_contesta", estado: "contactado" },
  { key: "promesa", label: "Promesa de pago", canal: "llamada", tipo: "promesa", resultado: "promesa", estado: "promesa_pago" },
  { key: "acuerdo", label: "Acuerdo de pago", canal: "llamada", tipo: "acuerdo", resultado: "acuerdo", estado: "acuerdo_pago" },
  { key: "pago", label: "Pagó / recaudó", canal: "sistema", tipo: "pago", resultado: "pago", estado: "al_dia" },
  { key: "incumplio", label: "Incumplió", canal: "sistema", tipo: "cambio_estado", resultado: null, estado: "incumplido" },
  { key: "juridico", label: "Pasar a jurídico", canal: "sistema", tipo: "cambio_estado", resultado: null, estado: "juridico" },
];

const SEM: Record<Semaforo, { label: string; cls: string }> = {
  al_dia: { label: "Al día", cls: "ok" },
  d1_30: { label: "Mora leve", cls: "warn" },
  d31_60: { label: "Mora media", cls: "mid" },
  d61_90: { label: "Mora alta", cls: "mid" },
  d90_mas: { label: "Mora crítica", cls: "high" },
};

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
type Filtro = "todos" | "al_dia" | "en_mora";
type Nivel = "todos" | "d1_30" | "d31_60" | "d61_90" | "d90_mas";
type Orden = "dias" | "deuda" | "saldo" | "cuota";

const NIVELES: [Nivel, string][] = [
  ["todos", "Todos los niveles"], ["d1_30", "Mora leve (1–30)"], ["d31_60", "Mora media (31–60)"],
  ["d61_90", "Mora alta (61–90)"], ["d90_mas", "Mora crítica (+90)"],
];
const ORDENES: [Orden, string][] = [
  ["dias", "Más días de mora"], ["deuda", "Mayor deuda vencida"], ["saldo", "Mayor saldo"], ["cuota", "Próxima cuota más cercana"],
];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function CarteraClient({ initialRows, cobradores = [], demo = false }: { initialRows: CarteraRow[]; cobradores?: Cobrador[]; demo?: boolean }) {
  const [rows, setRows] = useState(initialRows);
  const [filtro, setFiltro] = useState<Filtro>("en_mora");
  const [verCliente, setVerCliente] = useState<string | null>(null);
  const [nivel, setNivel] = useState<Nivel>("todos");
  const [proyecto, setProyecto] = useState("");
  const [estadoF, setEstadoF] = useState("todos");
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<Orden>("dias");
  const [range, setRange] = useState<Range>(() => rangeFor("todo"));
  const [cobradorId, setCobradorId] = useState("");

  useEffect(() => {
    const s = localStorage.getItem("cobrador_id");
    if (s && cobradores.some((c) => c.id === s)) setCobradorId(s);
    else if (cobradores.length) setCobradorId(cobradores[0].id);
  }, [cobradores]);
  useEffect(() => { if (cobradorId) localStorage.setItem("cobrador_id", cobradorId); }, [cobradorId]);

  // Cierra el drawer con Escape.
  useEffect(() => {
    if (!verCliente) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setVerCliente(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [verCliente]);

  useEffect(() => {
    if (demo) return;
    const supa = supabaseBrowser();
    if (!supa) return;
    const ch = supa
      .channel("cartera-gestion")
      .on("postgres_changes", { event: "*", schema: "public", table: "cartera_gestion" }, (p: any) => {
        const g = p.new;
        if (!g?.prospect_id) return;
        setRows((rs) => rs.map((r) => (r.prospect_id === g.prospect_id ? { ...r, estado: g.estado, ultima_gestion_at: g.ultima_gestion_at, ultimo_canal: g.ultimo_canal } : r)));
      })
      .subscribe();
    return () => { supa.removeChannel(ch); };
  }, [demo]);

  const cobradorNombre = cobradores.find((c) => c.id === cobradorId)?.nombre ?? null;

  const proyectos = useMemo(() => [...new Set(rows.map((r) => r.project_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);

  // KPIs sobre el proyecto seleccionado (los demás filtros no los afectan).
  const kpis = useMemo(() => {
    const base = proyecto ? rows.filter((r) => r.project_name === proyecto) : rows;
    return {
      n: base.length,
      totalMora: base.reduce((s, r) => s + r.monto_en_mora, 0),
      moraInicial: base.reduce((s, r) => s + (r.mora_inicial ?? 0), 0),
      moraCredito: base.reduce((s, r) => s + (r.mora_credito ?? 0), 0),
      clientesMora: base.filter((r) => r.monto_en_mora > 0).length,
      saldoTotal: base.reduce((s, r) => s + r.saldo, 0),
      alDia: base.filter((r) => r.semaforo === "al_dia").length,
      criticos: base.filter((r) => r.semaforo === "d90_mas").length,
    };
  }, [rows, proyecto]);

  const conFecha = range.from !== null || range.to !== null;
  const visibles = useMemo(() => {
    const query = norm(q.trim());
    let v = rows;
    if (filtro === "al_dia") v = v.filter((r) => r.semaforo === "al_dia");
    else if (filtro === "en_mora") v = v.filter((r) => r.monto_en_mora > 0);
    if (nivel !== "todos") v = v.filter((r) => r.semaforo === nivel);
    if (proyecto) v = v.filter((r) => r.project_name === proyecto);
    if (estadoF !== "todos") v = v.filter((r) => (r.estado || "sin_gestion") === estadoF);
    if (query) v = v.filter((r) => norm(`${r.cliente} ${r.module} ${r.project_name}`).includes(query));
    if (conFecha) v = v.filter((r) => inRange(r.proxima_cuota_fecha, range));
    const cuotaT = (r: CarteraRow) => (r.proxima_cuota_fecha ? new Date(r.proxima_cuota_fecha).getTime() : Infinity);
    const sorters: Record<Orden, (a: CarteraRow, b: CarteraRow) => number> = {
      dias: (a, b) => b.dias_mora - a.dias_mora, deuda: (a, b) => b.monto_en_mora - a.monto_en_mora,
      saldo: (a, b) => b.saldo - a.saldo, cuota: (a, b) => cuotaT(a) - cuotaT(b),
    };
    return [...v].sort(sorters[orden]);
  }, [rows, filtro, nivel, proyecto, estadoF, q, orden, range, conFecha]);

  const resumen = useMemo(() => ({ n: visibles.length }), [visibles]);

  const limpiar = () => { setFiltro("todos"); setNivel("todos"); setProyecto(""); setEstadoF("todos"); setQ(""); setOrden("dias"); };
  const hayFiltros = filtro !== "todos" || nivel !== "todos" || !!proyecto || estadoF !== "todos" || !!q.trim();

  async function gestionar(row: CarteraRow, a: Accion) {
    setRows((rs) => rs.map((r) => (r.prospect_id === row.prospect_id ? { ...r, estado: a.estado ?? r.estado, ultima_gestion_at: new Date().toISOString(), ultimo_canal: a.canal } : r)));
    if (demo) return;
    await fetch("/api/gestion", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospect_id: row.prospect_id, cobrador_id: cobradorId || null, cobrador_nombre: cobradorNombre, canal: a.canal, tipo: a.tipo, resultado: a.resultado, estado_nuevo: a.estado }),
    }).catch(() => {});
  }
  function whatsapp(row: CarteraRow) {
    const link = waLink(row.celular, plantillaCobro({ cliente: row.cliente, modulo: row.module, proyecto: row.project_name, montoEnMora: row.monto_en_mora, cuotasVencidas: row.cuotas_vencidas, diasMora: row.dias_mora, proximaCuotaFecha: row.proxima_cuota_fecha }));
    if (!link) { alert("Este cliente no tiene celular registrado en Smarthome."); return; }
    gestionar(row, { key: "wa", label: "", canal: "whatsapp", tipo: "contacto", resultado: null, estado: "contactado" });
    window.open(link, "_blank");
  }

  const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : "—");

  return (
    <>
      {/* Resumen */}
      <div className="kpis">
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-high"><IconCoins /></span><span className="kpi-label">Dinero en mora</span></div><div className="kpi-value">{COP.format(kpis.totalMora)}</div><div className="kpi-foot">vencido y sin pagar</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-warn"><IconWallet /></span><span className="kpi-label">Cuota inicial vencida</span></div><div className="kpi-value" style={{ fontSize: 21 }}>{COP.format(kpis.moraInicial)}</div><div className="kpi-foot">separación + cuotas de la inicial</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-high"><IconWallet /></span><span className="kpi-label">Crédito vencido</span></div><div className="kpi-value" style={{ fontSize: 21 }}>{COP.format(kpis.moraCredito)}</div><div className="kpi-foot">cuotas del crédito</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-warn"><IconAlert /></span><span className="kpi-label">Clientes en mora</span></div><div className="kpi-value">{kpis.clientesMora}</div><div className="kpi-foot">{kpis.criticos} en estado crítico (+90 días)</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico"><IconChart /></span><span className="kpi-label">Saldo total cartera</span></div><div className="kpi-value">{COP.format(kpis.saldoTotal)}</div><div className="kpi-foot">{kpis.n} ventas{proyecto ? ` · ${proyecto}` : " en total"}</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-ok"><IconCheck /></span><span className="kpi-label">Clientes al día</span></div><div className="kpi-value">{kpis.alDia}</div><div className="kpi-foot">sin cuotas vencidas</div></div>
      </div>

      {/* Filtros */}
      <div className="toolbar">
        <label className="field" style={{ flex: "1 1 220px", minWidth: 190 }}>Buscar cliente
          <input className="input" placeholder="Nombre, apartamento o proyecto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">Proyecto
          <select value={proyecto} onChange={(e) => setProyecto(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field">Nivel de mora
          <select value={nivel} onChange={(e) => setNivel(e.target.value as Nivel)}>
            {NIVELES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">Estado de gestión
          <select value={estadoF} onChange={(e) => setEstadoF(e.target.value)}>
            <option value="todos">Todas las gestiones</option>
            {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">Ordenar por
          <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
            {ORDENES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      <div className="toolbar" style={{ marginTop: -4 }}>
        <label className="field">Gestionando como
          <select value={cobradorId} onChange={(e) => setCobradorId(e.target.value)}>
            {cobradores.length === 0 && <option value="">—</option>}
            {cobradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="field">Vencimiento de próxima cuota
          <DateRange defaultPreset="todo" onChange={(r) => setRange(r)} />
        </label>
        <div style={{ marginLeft: "auto" }} className="segmented">
          {([["todos", "Todos"], ["en_mora", "Retrasados"], ["al_dia", "Al día"]] as [Filtro, string][]).map(([f, l]) => (
            <button key={f} className={`seg${filtro === f ? " active" : ""}`} onClick={() => setFiltro(f)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="section-title" style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <span>{resumen.n} {resumen.n === 1 ? "cliente" : "clientes"}</span>
        {hayFiltros && <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={limpiar}>Limpiar filtros</button>}
      </div>

      <div className="table-wrap table-scroll">
        <table className="clean cartera">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Estado de mora</th>
              <th style={{ textAlign: "right" }}>Deuda vencida</th>
              <th style={{ textAlign: "right" }}>Saldo total</th>
              <th>Gestión</th>
              <th style={{ textAlign: "right" }}>Registrar</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => {
              const sem = SEM[r.semaforo];
              return (
                <tr key={r.prospect_id} className={`sem-${sem.cls}`}>
                  <td>
                    <a className="cc-name" style={{ display: "block", color: "inherit", cursor: "pointer" }} title="Ver bitácora y estado del cliente" onClick={() => setVerCliente(r.cliente)}>{r.cliente}</a>
                    <div className="cc-meta">{r.module} · {r.project_name}</div>
                  </td>
                  <td>
                    <span className={`badge ${sem.cls}`}>{sem.label}</span>
                    {r.dias_mora > 0 && <span className="cc-dias">{r.dias_mora} días de mora</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {r.monto_en_mora > 0 ? (<>
                      <b className="cc-debt num">{COP.format(r.monto_en_mora)}</b>
                      <span className="cc-cuotas">{r.cuotas_vencidas} {r.cuotas_vencidas === 1 ? "cuota vencida" : "cuotas vencidas"}</span>
                      {(r.mora_inicial ?? 0) > 0 && <span className="cc-cuotas">Cuota inicial: <b className="num">{COP.format(r.mora_inicial)}</b></span>}
                      {(r.mora_credito ?? 0) > 0 && <span className="cc-cuotas">Crédito: <b className="num">{COP.format(r.mora_credito)}</b></span>}
                    </>) : <span className="muted">—</span>}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(r.saldo)}</td>
                  <td>
                    <span className="cc-gestion-estado">{ESTADO_LABEL[r.estado] ?? "Sin gestionar"}</span>
                    <span className="cc-gestion-sub">{r.ultima_gestion_at ? `${fmtFecha(r.ultima_gestion_at)} · ${r.ultimo_canal ?? "—"}` : "sin gestión"}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-wa btn-sm" onClick={() => whatsapp(r)} title="Contactar por WhatsApp (registra la gestión)"><IconWhatsApp /> WhatsApp</button>
                      <select className="input select-sm" value="" onChange={(e) => { const a = ACCIONES.find((x) => x.key === e.target.value); if (a) gestionar(r, a); e.target.value = ""; }}>
                        <option value="">Registrar…</option>
                        {ACCIONES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 28 }}>No hay clientes en esta vista. Prueba el filtro “Todos”.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {verCliente && (
        <>
          <div className="drawer-overlay" onClick={() => setVerCliente(null)} />
          <aside className="drawer" role="dialog" aria-label={`Detalle de ${verCliente}`}>
            <div className="drawer-head">
              <h2 className="drawer-title">{verCliente}</h2>
              <button className="drawer-close" onClick={() => setVerCliente(null)} title="Cerrar (Esc)">×</button>
            </div>
            <div className="drawer-body">
              <BitacoraClient key={verCliente} usuarios={[]} clienteInicial={verCliente} compact />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
