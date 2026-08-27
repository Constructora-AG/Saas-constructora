"use client";
import { useEffect, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DateRange, rangeFor, type Range } from "../DateRange";
import { IconWhatsApp, IconPhone, IconMessage, IconCoins, IconSettings, IconCheck, IconWallet } from "../icons";

interface Evento {
  event_id: string;
  cliente: string;
  module: string;
  usuario: string;
  fecha: string;
  tipo: number;
  contenido: string;
  es_pago: boolean;
  monto: number | null;
}
interface Stats { total: number; recaudos: number; recaudado: number; whatsapp: number; notas: number; tareas: number; }
interface Pendiente {
  saldo: number; saldo_inicial: number; saldo_credito: number; pagado: number; mora: number; mora_inicial: number; mora_credito: number; valor: number; ventas: number;
  dias_mora: number; cuotas_vencidas: number; cuotas_pagadas: number; cuotas_por_vencer: number; cuotas_total: number;
  proxima_cuota_fecha: string | null; proxima_cuota_valor: number; en_mora: number;
}
const PEND0: Pendiente = { saldo: 0, saldo_inicial: 0, saldo_credito: 0, pagado: 0, mora: 0, mora_inicial: 0, mora_credito: 0, valor: 0, ventas: 0, dias_mora: 0, cuotas_vencidas: 0, cuotas_pagadas: 0, cuotas_por_vencer: 0, cuotas_total: 0, proxima_cuota_fecha: null, proxima_cuota_valor: 0, en_mora: 0 };

interface Inmueble {
  module: string; proyecto: string; mora: number; saldo: number; saldo_inicial: number; saldo_credito: number;
  dias_mora: number; cuotas_vencidas: number; cuotas_pagadas: number; cuotas_total: number;
  proxima_cuota_fecha: string | null; proxima_cuota_valor: number; semaforo: string;
}
const SEMMAP: Record<string, { label: string; cls: string }> = {
  al_dia: { label: "Al día", cls: "ok" }, d1_30: { label: "Mora leve", cls: "warn" },
  d31_60: { label: "Mora media", cls: "mid" }, d61_90: { label: "Mora alta", cls: "mid" }, d90_mas: { label: "Mora crítica", cls: "high" },
};

const FILTROS: [string, string][] = [
  ["todos", "Todos"], ["recaudo", "Recaudos"], ["whatsapp", "WhatsApp"], ["nota", "Notas / seguimiento"], ["tarea", "Tareas"],
];
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-CO");

function clasificar(e: Evento): { label: string; ico: ReactNode; cls: string } {
  if (e.es_pago) return { label: "Recaudo", ico: <IconCoins />, cls: "wa" };
  if (/enviado por whatsapp/i.test(e.contenido)) return { label: "WhatsApp", ico: <IconWhatsApp />, cls: "wa" };
  if (e.tipo === 2) return { label: "Tarea", ico: <IconCheck />, cls: "call" };
  if (e.tipo === 0) return { label: "Sistema", ico: <IconSettings />, cls: "sys" };
  return { label: "Nota", ico: <IconPhone />, cls: "call" };
}
function fmt(iso: string) { return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); }

export function BitacoraClient({ usuarios, clientes = [], clienteInicial = "", compact = false }: { usuarios: string[]; clientes?: string[]; clienteInicial?: string; compact?: boolean }) {
  const [rows, setRows] = useState<Evento[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, recaudos: 0, recaudado: 0, whatsapp: 0, notas: 0, tareas: 0 });
  const [pend, setPend] = useState<Pendiente>(PEND0);
  const [inmuebles, setInmuebles] = useState<Inmueble[]>([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState("todos");
  const [usuario, setUsuario] = useState("");
  const [cliente, setCliente] = useState(clienteInicial);
  const [modulo, setModulo] = useState("");
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>(() => rangeFor("anio"));

  useEffect(() => {
    const supa = supabaseBrowser();
    if (!supa) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const desde = range.from ? range.from.toISOString() : null;
      const hasta = range.to ? range.to.toISOString() : null;

      let query = supa.from("sh_eventos")
        .select("event_id,cliente,module,usuario,fecha,tipo,contenido,es_pago,monto")
        .order("fecha", { ascending: false }).limit(300);
      if (usuario) query = query.eq("usuario", usuario);
      if (cliente.trim()) query = query.ilike("cliente", `%${cliente.trim()}%`);
      if (modulo.trim()) query = query.ilike("module", `%${modulo.trim()}%`);
      if (desde) query = query.gte("fecha", desde);
      if (hasta) query = query.lte("fecha", hasta);
      if (q.trim()) query = query.ilike("contenido", `%${q.trim()}%`);
      if (bucket === "recaudo") query = query.eq("es_pago", true);
      else if (bucket === "whatsapp") query = query.ilike("contenido", "%enviado por whatsapp%");
      else if (bucket === "tarea") query = query.eq("tipo", 2);
      else if (bucket === "nota") query = query.eq("tipo", 1).eq("es_pago", false).not("contenido", "ilike", "%enviado por whatsapp%");

      const filtrando = !!cliente.trim() || !!modulo.trim();
      const [{ data: list }, { data: st }, { data: pe }, inm] = await Promise.all([
        query,
        supa.rpc("bitacora_stats", { desde, hasta, uzr: usuario || null, cli: cliente.trim() || null, modu: modulo.trim() || null }),
        supa.rpc("cartera_pendiente", { cli: cliente.trim() || null, modu: modulo.trim() || null }),
        filtrando ? supa.rpc("cartera_inmuebles", { cli: cliente.trim() || null, modu: modulo.trim() || null }) : Promise.resolve({ data: [] }),
      ]);
      if (cancel) return;
      setRows((list ?? []) as Evento[]);
      const s = ((st ?? []) as any[])[0];
      if (s) setStats({ total: +s.total, recaudos: +s.recaudos, recaudado: +s.recaudado, whatsapp: +s.whatsapp, notas: +s.notas, tareas: +s.tareas });
      const p = ((pe ?? []) as any[])[0];
      if (p) setPend({
        saldo: +p.saldo, saldo_inicial: +p.saldo_inicial, saldo_credito: +p.saldo_credito, pagado: +p.pagado,
        mora: +p.mora, mora_inicial: +(p.mora_inicial ?? 0), mora_credito: +(p.mora_credito ?? 0), valor: +p.valor, ventas: +p.ventas, dias_mora: +p.dias_mora, cuotas_vencidas: +p.cuotas_vencidas,
        cuotas_pagadas: +p.cuotas_pagadas, cuotas_por_vencer: +p.cuotas_por_vencer, cuotas_total: +p.cuotas_total,
        proxima_cuota_fecha: p.proxima_cuota_fecha, proxima_cuota_valor: +p.proxima_cuota_valor, en_mora: +p.en_mora,
      });
      setInmuebles(((inm as any).data ?? []) as Inmueble[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [bucket, usuario, cliente, modulo, q, range]);

  const semLabel = (d: number) => d <= 0 ? "Al día" : d <= 30 ? "Mora leve" : d <= 60 ? "Mora media" : d <= 90 ? "Mora alta" : "Mora crítica";
  const semCls = (d: number) => d <= 0 ? "ok" : d <= 30 ? "warn" : d <= 90 ? "mid" : "high";
  const fmtF = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—");
  const filtroActivo = !!cliente.trim() || !!modulo.trim();

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico"><IconMessage /></span><span className="kpi-label">Gestiones</span></div><div className="kpi-value">{NUM.format(stats.total)}</div><div className="kpi-foot">{stats.notas} notas de seguimiento</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-ok"><IconWhatsApp /></span><span className="kpi-label">Envíos WhatsApp</span></div><div className="kpi-value">{NUM.format(stats.whatsapp)}</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-ok"><IconCoins /></span><span className="kpi-label">Recaudado (período)</span></div><div className="kpi-value" style={{ fontSize: 20 }}>{COP.format(stats.recaudado)}</div><div className="kpi-foot">{stats.recaudos} recibos de caja</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-warn"><IconWallet /></span><span className="kpi-label">Falta cuota inicial</span></div><div className="kpi-value" style={{ fontSize: 20 }}>{COP.format(pend.saldo_inicial)}</div><div className="kpi-foot">separación + cuotas</div></div>
        <div className="kpi"><div className="kpi-head"><span className="kpi-ico s-high"><IconWallet /></span><span className="kpi-label">Falta crédito</span></div><div className="kpi-value" style={{ fontSize: 20 }}>{COP.format(pend.saldo_credito)}</div><div className="kpi-foot">{pend.valor > 0 ? `${Math.round((pend.pagado / pend.valor) * 100)}% del total ya pagado` : ""}</div></div>
      </div>

      <div className="toolbar">
        <label className="field" style={{ flex: "1 1 220px", minWidth: 190 }}>Buscar en la gestión
          <input className="input" placeholder="Texto de la nota, recibo, cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {!compact && (<>
          <label className="field" style={{ flex: "1 1 220px", minWidth: 190 }}>Cliente
            <input className="input" list="clientes-list" placeholder="Todos · escribe un nombre…" value={cliente} onChange={(e) => setCliente(e.target.value)} />
            <datalist id="clientes-list">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="field">Apartamento / Torre
            <input className="input" placeholder="Ej: TORRE 1 APTO 302" value={modulo} onChange={(e) => setModulo(e.target.value)} />
          </label>
          <label className="field">Gestor
            <select value={usuario} onChange={(e) => setUsuario(e.target.value)}>
              <option value="">Todo el equipo</option>
              {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        </>)}
        <label className="field">Período
          <DateRange defaultPreset="anio" onChange={(r) => setRange(r)} />
        </label>
      </div>
      <div className="toolbar" style={{ marginTop: -4 }}>
        <div className="segmented">
          {FILTROS.map(([k, l]) => <button key={k} className={`seg${bucket === k ? " active" : ""}`} onClick={() => setBucket(k)}>{l}</button>)}
        </div>
        {loading && <span className="muted" style={{ fontSize: 13, marginLeft: 12 }}>Cargando…</span>}
      </div>

      {filtroActivo && (
        <div className="estado-panel">
          <div className="estado-item">
            <span className="estado-label">Estado</span>
            {pend.mora > 0
              ? <span className={`badge ${semCls(pend.dias_mora)}`}>En mora · {pend.dias_mora} días · {semLabel(pend.dias_mora)}</span>
              : <span className="badge ok">Al día</span>}
            {pend.mora > 0 && <span className="estado-sub">{COP.format(pend.mora)} vencido · inicial {COP.format(pend.mora_inicial)} · crédito {COP.format(pend.mora_credito)}</span>}
          </div>
          <div className="estado-item">
            <span className="estado-label">Cuotas</span>
            <span className="estado-val">
              <b style={{ color: "var(--ok)" }}>{pend.cuotas_pagadas}</b> pagadas ·{" "}
              <b style={{ color: "var(--high)" }}>{pend.cuotas_vencidas}</b> vencidas ·{" "}
              <b>{pend.cuotas_por_vencer}</b> por vencer
            </span>
            <span className="estado-sub">de {pend.cuotas_total} en total</span>
          </div>
          <div className="estado-item">
            <span className="estado-label">Próxima cuota</span>
            <span className="estado-val">{pend.proxima_cuota_fecha ? fmtF(pend.proxima_cuota_fecha) : "sin cuotas por vencer"}</span>
            {pend.proxima_cuota_valor > 0 && <span className="estado-sub">{COP.format(pend.proxima_cuota_valor)}</span>}
          </div>
          {pend.ventas > 1 && <div className="estado-item"><span className="estado-label">Inmuebles</span><span className="estado-val">{pend.ventas} aptos</span></div>}
        </div>
      )}

      {filtroActivo && inmuebles.length > 1 && (
        <>
          <div className="section-title">Inmuebles del cliente ({inmuebles.length}) — cuál tiene la deuda</div>
          <div className="table-wrap table-scroll">
            <table className="clean cartera">
              <thead><tr>
                <th>Inmueble</th><th>Estado</th><th style={{ textAlign: "right" }}>En mora</th>
                <th style={{ textAlign: "right" }}>Saldo (inicial / crédito)</th><th>Próxima cuota</th>
              </tr></thead>
              <tbody>
                {inmuebles.map((i) => {
                  const sem = SEMMAP[i.semaforo] ?? { label: i.semaforo, cls: "ok" };
                  return (
                    <tr key={i.module + i.proyecto} className={`sem-${sem.cls}`}>
                      <td><div className="cc-name">{i.module}</div><div className="cc-meta">{i.proyecto}</div></td>
                      <td><span className={`badge ${sem.cls}`}>{sem.label}</span>{i.dias_mora > 0 && <span className="cc-dias">{i.dias_mora} días · {i.cuotas_vencidas} cuotas vencidas</span>}</td>
                      <td style={{ textAlign: "right" }}>{i.mora > 0 ? <b className="cc-debt num">{COP.format(i.mora)}</b> : <span className="muted">—</span>}</td>
                      <td className="num" style={{ textAlign: "right" }}>{COP.format(i.saldo)}<span className="cc-cuotas">inicial {COP.format(i.saldo_inicial)} · créd. {COP.format(i.saldo_credito)}</span></td>
                      <td className="num">{i.proxima_cuota_fecha ? fmtF(i.proxima_cuota_fecha) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="section-title">Bitácora {rows.length >= 300 ? "(300+ · más recientes)" : `(${rows.length})`}</div>
      <div className="feed">
        {rows.map((e) => {
          const c = clasificar(e);
          return (
            <div key={e.event_id} className="feed-item">
              <span className={`feed-ico ${c.cls}`}>{c.ico}</span>
              <div style={{ flex: 1 }}>
                <div>
                  {e.usuario ? <b>{e.usuario}</b> : <span className="muted">Sistema</span>}
                  {" · "}<b>{e.cliente}</b>{e.module && <span className="muted"> · {e.module}</span>}
                </div>
                <div style={{ marginTop: 2 }}>{e.contenido}{e.monto ? <b className="n-wa"> · {COP.format(e.monto)}</b> : null}</div>
                <div className="feed-time"><span className={`badge ${c.cls === "wa" ? "ok" : "warn"}`} style={{ padding: "1px 7px", fontSize: 11 }}>{c.label}</span> · {fmt(e.fecha)}</div>
              </div>
            </div>
          );
        })}
        {!loading && rows.length === 0 && <div className="feed-item muted">Sin gestiones para este filtro.</div>}
      </div>
    </>
  );
}
