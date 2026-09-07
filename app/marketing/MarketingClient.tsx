"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DateRange, rangeFor, type Range } from "../DateRange";
import { IconUsers, IconCheck, IconKey, IconAlert, IconRefresh, IconCoins, IconActivity, IconInfo } from "../icons";
import { useUsuario } from "@/lib/auth/useUsuario";
import type { Inversion, Lead, MarketingData, Prospecto } from "@/lib/marketing/types";
import {
  agruparLeads, canalCorto, cpaPorMes, distribucion, embudo, esCompra, esContactado, esDescartado,
  gestionPorAsesor, normGenero, pct, porCreativo, rangoEdad, totalGestion, SEGUIMIENTO_LABEL,
} from "@/lib/marketing/compute";

const NUM = new Intl.NumberFormat("es-CO");
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const PCT = (v: number) => `${Math.round(v * 100)}%`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtMes = (m: string) => { const [y, mm] = m.split("-"); return `${MESES[+mm - 1]} ${y}`; };
const fmtFecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const hace = (iso: string | null) => {
  if (!iso) return "—";
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} días`;
};
const iniciales = (n: string) => n.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const ISO = (d: Date | null) => (d ? d.toISOString() : null);

type Vista = "marketing" | "gestion" | "inversion";
const VISTAS: [Vista, string][] = [["marketing", "Marketing"], ["gestion", "Gestión comercial"], ["inversion", "Inversión y CPA"]];

export function MarketingClient({ proyectos }: { proyectos: string[] }) {
  const { usuario } = useUsuario();
  const [vista, setVista] = useState<Vista>("marketing");
  const [range, setRange] = useState<Range>(() => rangeFor("30d"));
  const [proyecto, setProyecto] = useState("");
  const [canal, setCanal] = useState("");
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<"idle" | "run" | "ok" | "err">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [error, setError] = useState("");

  const cargar = useCallback(async (r: Range) => {
    setLoading(true);
    setError("");
    const qs = new URLSearchParams();
    if (r.from) qs.set("desde", ISO(r.from)!);
    if (r.to) qs.set("hasta", ISO(r.to)!);
    try {
      const res = await fetch(`/api/marketing/data?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      setData(j as MarketingData);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void cargar(range); }, [range, cargar]);

  async function sincronizar() {
    setSync("run");
    setSyncMsg("Consultando Smarthome… puede tardar 1–3 minutos.");
    try {
      const res = await fetch("/api/marketing/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok || (!j.leads && !j.prospectos)) throw new Error(j.error ?? (j.errores ?? []).join("; ") ?? "sin datos");
      setSync("ok");
      setSyncMsg(`Listo: ${NUM.format(j.leads)} leads y ${NUM.format(j.prospectos)} prospectos en ${j.segundos}s${j.errores?.length ? ` · avisos: ${j.errores.join("; ")}` : ""}`);
      await cargar(range);
    } catch (e) {
      setSync("err");
      setSyncMsg(`No se pudo sincronizar: ${String(e)}`);
    }
  }

  // ── Filtros en memoria ──────────────────────────────────────────────────────
  const leads = useMemo(() => (data?.leads ?? []).filter((l) => (!proyecto || l.proyecto === proyecto) && (!canal || l.canal === canal)), [data, proyecto, canal]);
  const prospectos = useMemo(() => (data?.prospectos ?? []).filter((p) => !proyecto || p.proyecto === proyecto), [data, proyecto]);
  const compradores = useMemo(() => (data?.compradores ?? []).filter((p) => !proyecto || p.proyecto === proyecto), [data, proyecto]);
  const canales = useMemo(() => [...new Set((data?.leads ?? []).map((l) => l.canal).filter(Boolean))].sort(), [data]);

  return (
    <>
      <div className="filters-bar">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ gap: 7 }}>
            Vista
            <div className="segmented">
              {VISTAS.map(([k, l]) => (
                <button key={k} className={`seg${vista === k ? " active" : ""}`} onClick={() => setVista(k)}>{l}</button>
              ))}
            </div>
          </label>
          <label className="field">
            Proyecto
            <select className="input select-sm" value={proyecto} onChange={(e) => setProyecto(e.target.value)}>
              <option value="">Todos</option>
              {proyectos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          {vista !== "gestion" && (
            <label className="field">
              Canal
              <select className="input select-sm" value={canal} onChange={(e) => setCanal(e.target.value)}>
                <option value="">Todos</option>
                {canales.map((c) => <option key={c} value={c}>{canalCorto(c)}</option>)}
              </select>
            </label>
          )}
          <label className="field" style={{ gap: 7 }}>
            Período (por fecha de llegada del lead)
            <DateRange defaultPreset="30d" onChange={(r) => setRange(r)} />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {loading ? "Cargando…" : data?.ultimoSync ? `Actualizado hace ${hace(data.ultimoSync)}` : "Sin sincronizar aún"}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => void sincronizar()} disabled={sync === "run"}>
            <IconRefresh /> {sync === "run" ? "Sincronizando…" : "Actualizar desde Smarthome"}
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="info-bar" style={sync === "err" ? { background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" } : undefined}>
          <IconInfo /><div>{syncMsg}</div>
        </div>
      )}
      {error && (
        <div className="info-bar" style={{ background: "var(--high-soft)", borderColor: "#eccaca", color: "var(--high)" }}>
          <IconAlert /><div><b>No se pudieron cargar los datos.</b><div>{error}</div></div>
        </div>
      )}

      {data && !data.ultimoSync && !loading && (
        <div className="info-bar"><IconInfo /><div>Todavía no hay datos espejo. Pulsa <b>Actualizar desde Smarthome</b> para traer los leads y prospectos.</div></div>
      )}

      {vista === "marketing" && <VistaMarketing leads={leads} compradores={compradores} />}
      {vista === "gestion" && <VistaGestion prospectos={prospectos} />}
      {vista === "inversion" && (
        <VistaInversion leads={leads} inversion={data?.inversion ?? []} proyectos={proyectos} proyecto={proyecto} canal={canal}
          puedeEditar={usuario?.rol === "gerencia"} onChange={() => cargar(range)} />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Vista Marketing: embudo, canal, anuncio/creativo, perfil de quien compra
// ═══════════════════════════════════════════════════════════════════════════
function VistaMarketing({ leads, compradores }: { leads: Lead[]; compradores: Prospecto[] }) {
  const e = useMemo(() => embudo(leads), [leads]);
  const creativos = useMemo(() => porCreativo(leads), [leads]);
  const canales = useMemo(() => agruparLeads(leads, (l) => l.canal), [leads]);
  const [verTodos, setVerTodos] = useState(false);

  const pasos: [string, number, string][] = [
    ["Contactos recibidos", e.contactos, "registros digitales"],
    ["Contactados (hubo gestión)", e.contactados, "salieron de 'Prospecto'"],
    ["Calificados (≥ 25 %)", e.calificados, "Seguimiento en adelante"],
    ["Oportunidad / Negociación (≥ 50 %)", e.oportunidades, ""],
    ["Ventas (Ciclo de Compra)", e.ventas, ""],
  ];

  // Precalificación del formulario de Meta (solo leads que la respondieron)
  const precal = useMemo(() => ({
    credito: distribucion(leads.map((l) => l.credito_aprobado)),
    empleo: distribucion(leads.map((l) => l.empleo)),
    reportado: distribucion(leads.map((l) => l.reportado)),
    capacidad: distribucion(leads.map((l) => l.capacidad_pago)),
    motivacion: distribucion(leads.map((l) => l.motivacion)),
    tiempo: distribucion(leads.map((l) => l.tiempo_compra)),
  }), [leads]);

  const perfil = useMemo(() => ({
    genero: distribucion(compradores.map((p) => normGenero(p.genero))),
    edad: distribucion(compradores.map((p) => rangoEdad(p.edad))),
    ciudad: distribucion(compradores.map((p) => p.ciudad?.toUpperCase())),
    barrio: distribucion(compradores.map((p) => p.barrio?.toUpperCase()), 10),
    civil: distribucion(compradores.map((p) => p.estado_civil)),
    fuente: distribucion(compradores.map((p) => p.fuente)),
    profesion: distribucion(compradores.map((p) => p.profesion), 10),
  }), [compradores]);

  const filas = verTodos ? creativos : creativos.slice(0, 12);

  return (
    <>
      <div className="kpis">
        <Kpi icon={<IconUsers />} label="Leads recibidos" value={NUM.format(e.contactos)} foot={`${NUM.format(e.unicos)} únicos · ${NUM.format(e.contactos - e.unicos)} repetidos`} />
        <Kpi icon={<IconActivity />} label="Calificados" value={NUM.format(e.calificados)} foot={`${PCT(pct(e.calificados, e.contactos))} de los leads`} tone="warn" />
        <Kpi icon={<IconCheck />} label="Oportunidades" value={NUM.format(e.oportunidades)} foot={`${PCT(pct(e.oportunidades, e.contactos))} de los leads`} />
        <Kpi icon={<IconKey />} label="Ventas" value={NUM.format(e.ventas)} foot={e.ventas ? `1 venta cada ${NUM.format(Math.round(e.contactos / e.ventas))} leads` : "sin ventas en el período"} tone="ok" />
        <Kpi icon={<IconAlert />} label="Descartados" value={NUM.format(e.descartados)} foot={`${PCT(pct(e.descartados, e.contactos))} · ${NUM.format(e.vivos)} siguen vivos`} tone="high" />
      </div>

      <div className="charts-grid" style={{ marginTop: 18 }}>
        <div className="chart-card">
          <div className="chart-title">Embudo de conversión</div>
          <div className="chart-sub">De cada bloque de contactos, cuántos avanzan en cada etapa.</div>
          <div style={{ marginTop: 12 }}>
            {pasos.map(([nombre, n, sub], i) => (
              <div className="bar-row" key={nombre}>
                <div className="bar-name" title={sub}>{nombre}</div>
                <div className="bar-track"><div className={`bar-fill${i === pasos.length - 1 ? " full" : ""}`} style={{ width: `${Math.max(2, pct(n, e.contactos) * 100)}%` }} /></div>
                <div className="bar-val"><b>{NUM.format(n)}</b> <span className="bar-pct">{PCT(pct(n, e.contactos))}{i > 0 && pasos[i - 1][1] ? ` · ${PCT(pct(n, pasos[i - 1][1]))} del paso anterior` : ""}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-title">Por canal</div>
          <div className="chart-sub">Facebook trae más leads: ¿también es el que más convierte?</div>
          <table className="clean" style={{ marginTop: 10 }}>
            <thead><tr><th>Canal</th><th className="num" style={{ textAlign: "right" }}>Leads</th><th className="num" style={{ textAlign: "right" }}>Calificados</th><th className="num" style={{ textAlign: "right" }}>% calif.</th><th className="num" style={{ textAlign: "right" }}>Ventas</th></tr></thead>
            <tbody>
              {canales.map((c) => (
                <tr key={c.clave}>
                  <td><b>{canalCorto(c.clave)}</b></td>
                  <td className="num" style={{ textAlign: "right" }}>{NUM.format(c.leads)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{NUM.format(c.calificados)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{PCT(pct(c.calificados, c.leads))}</td>
                  <td style={{ textAlign: "right" }}>{c.ventas ? <span className="badge ok">{c.ventas}</span> : <span className="muted">0</span>}</td>
                </tr>
              ))}
              {canales.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>Sin leads en este período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-title">Ángulo de venta: leads y conversión por anuncio / creativo</div>
      <p className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 12 }}>
        El anuncio de Meta que originó cada lead (click-to-WhatsApp o Lead Ads). Ordenado por ventas, luego calificados.
      </p>
      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead>
            <tr>
              <th>Anuncio / creativo</th>
              <th>Canal</th>
              <th className="num" style={{ textAlign: "right" }}>Leads</th>
              <th className="num" style={{ textAlign: "right" }}>Contactados</th>
              <th className="num" style={{ textAlign: "right" }}>Calificados</th>
              <th className="num" style={{ textAlign: "right" }}>% calif.</th>
              <th className="num" style={{ textAlign: "right" }}>Oportun.</th>
              <th className="num" style={{ textAlign: "right" }}>Ventas</th>
              <th className="num" style={{ textAlign: "right" }}>Descart.</th>
              <th className="num" style={{ textAlign: "right" }}>Crédito sí</th>
              <th>Último lead</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.clave}>
                <td style={{ maxWidth: 360 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {c.miniatura ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.miniatura} alt="" width={44} height={44} style={{ objectFit: "cover", borderRadius: 6, flex: "none", background: "var(--surface-2)" }} referrerPolicy="no-referrer" />
                    ) : (
                      <span className="avatar" style={{ flex: "none" }}>{c.tipo === "video" ? "▶" : "AD"}</span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: "normal" }}>{c.titulo}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {c.tipo || "—"}{c.clave && !c.clave.startsWith("t:") && c.clave !== "organico" ? ` · id ${c.clave}` : ""}
                        {c.url && <> · <a href={c.url} target="_blank" rel="noreferrer">ver pieza</a></>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="muted" style={{ fontSize: 12.5 }}>{c.canales.map(canalCorto).join(", ")}</td>
                <td className="num" style={{ textAlign: "right" }}>{NUM.format(c.leads)}</td>
                <td className="num" style={{ textAlign: "right" }}>{NUM.format(c.contactados)}</td>
                <td className="num" style={{ textAlign: "right" }}>{NUM.format(c.calificados)}</td>
                <td className="num" style={{ textAlign: "right" }}><b>{PCT(pct(c.calificados, c.leads))}</b></td>
                <td className="num" style={{ textAlign: "right" }}>{c.oportunidades || <span className="muted">—</span>}</td>
                <td style={{ textAlign: "right" }}>{c.ventas ? <span className="badge ok">{c.ventas}</span> : <span className="muted">0</span>}</td>
                <td className="num" style={{ textAlign: "right" }}>{NUM.format(c.descartados)}</td>
                <td className="num" style={{ textAlign: "right" }}>{c.creditoSi + c.creditoNo ? `${c.creditoSi} / ${c.creditoSi + c.creditoNo}` : <span className="muted">—</span>}</td>
                <td className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{fmtFecha(c.ultimoLead)}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={11} className="muted" style={{ textAlign: "center", padding: 24 }}>Sin leads en este período.</td></tr>}
          </tbody>
        </table>
      </div>
      {creativos.length > 12 && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setVerTodos((v) => !v)}>{verTodos ? "Ver menos" : `Ver los ${creativos.length} anuncios`}</button>
        </div>
      )}

      <div className="section-title">Precalificación (respuestas del formulario / bot)</div>
      <div className="charts-grid">
        <Dist titulo="¿Cuenta con crédito aprobado?" d={precal.credito} />
        <Dist titulo="¿Empleado o independiente?" d={precal.empleo} />
        <Dist titulo="¿Reportado en centrales de riesgo?" d={precal.reportado} />
        <Dist titulo="Capacidad de pago mensual" d={precal.capacidad} />
        <Dist titulo="Motivación de compra" d={precal.motivacion} />
        <Dist titulo="¿En cuánto tiempo piensa comprar?" d={precal.tiempo} />
      </div>

      <div className="section-title">Perfil de quien SÍ compra</div>
      <p className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 12 }}>
        {NUM.format(compradores.length)} compradores en Ciclo de Compra (histórico completo, no depende del período). Solo se cuentan los que tienen el dato diligenciado en Smarthome.
      </p>
      <div className="charts-grid">
        <Dist titulo="Género" d={perfil.genero} />
        <Dist titulo="Rango de edad" d={perfil.edad} />
        <Dist titulo="Ciudad" d={perfil.ciudad} />
        <Dist titulo="Barrio" d={perfil.barrio} />
        <Dist titulo="Estado civil" d={perfil.civil} />
        <Dist titulo="Fuente por la que llegó" d={perfil.fuente} />
        <Dist titulo="Profesión / ocupación" d={perfil.profesion} />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Vista Gestión comercial: semáforo de tareas y gestión por asesor
// ═══════════════════════════════════════════════════════════════════════════
function VistaGestion({ prospectos }: { prospectos: Prospecto[] }) {
  const filas = useMemo(() => gestionPorAsesor(prospectos), [prospectos]);
  const t = useMemo(() => totalGestion(filas), [filas]);
  const vivos = t.recibidos - t.ventas - t.descartados;

  const sinGestion = useMemo(() => prospectos
    .filter((p) => !esCompra(p.ciclo, p.etapa, p.es_venta) && !esDescartado(p.ciclo) && !esContactado(p.etapa, p.acciones))
    .sort((a, b) => (a.fecha_creacion ?? "").localeCompare(b.fecha_creacion ?? ""))
    .slice(0, 60), [prospectos]);

  return (
    <>
      <div className="kpis">
        <Kpi icon={<IconUsers />} label="Leads recibidos" value={NUM.format(t.recibidos)} foot={`${NUM.format(vivos)} en gestión · ${NUM.format(t.descartados)} descartados · ${NUM.format(t.ventas)} ventas`} />
        <Kpi icon={<IconAlert />} label="Sin ninguna gestión" value={NUM.format(t.sinGestion)} foot={`${PCT(pct(t.sinGestion, t.recibidos))} de los recibidos · ${NUM.format(t.sinGestion24h)} llevan más de 24 h`} tone="high" />
        <Kpi icon={<IconActivity />} label="Tareas vencidas (rojo)" value={NUM.format(t.vencidos)} foot={`${PCT(pct(t.vencidos, vivos))} de los leads en gestión`} tone="high" />
        <Kpi icon={<IconCheck />} label="Con tarea activa (verde)" value={NUM.format(t.activos)} foot={`${NUM.format(t.inactivos)} sin tareas (gris)`} tone="ok" />
        <Kpi icon={<IconKey />} label="Contactados" value={PCT(pct(t.contactados, t.recibidos))} foot={`${NUM.format(t.contactados)} con al menos una gestión`} />
      </div>

      <div className="section-title">Gestión por asesor</div>
      <p className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 12 }}>
        Semáforo de Smarthome: <b>verde</b> = tarea programada, <b>rojo</b> = tarea vencida sin renovar, <b>gris</b> = sin tareas. "Sin gestión" = sigue en etapa Prospecto y no registra llamadas, WhatsApp, correos ni visitas.
      </p>
      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead>
            <tr>
              <th>Asesor</th>
              <th className="num" style={{ textAlign: "right" }}>Recibidos</th>
              <th className="num" style={{ textAlign: "right" }}>Sin gestión</th>
              <th className="num" style={{ textAlign: "right" }}>&gt; 24 h</th>
              <th className="num" style={{ textAlign: "right" }}>Contactados</th>
              <th className="num" style={{ textAlign: "right" }}>Vencidos</th>
              <th className="num" style={{ textAlign: "right" }}>Activos</th>
              <th className="num" style={{ textAlign: "right" }}>Calificados</th>
              <th className="num" style={{ textAlign: "right" }}>Descartados</th>
              <th className="num" style={{ textAlign: "right" }}>Ventas</th>
              <th className="num" style={{ textAlign: "right" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => {
              const vivosR = r.recibidos - r.ventas - r.descartados;
              const pv = pct(r.vencidos, vivosR);
              return (
                <tr key={r.asesor}>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="avatar">{iniciales(r.asesor)}</span><b>{r.asesor}</b></div></td>
                  <td className="num" style={{ textAlign: "right" }}>{NUM.format(r.recibidos)}</td>
                  <td style={{ textAlign: "right" }}><span className={`badge ${pct(r.sinGestion, r.recibidos) > 0.5 ? "high" : pct(r.sinGestion, r.recibidos) > 0.2 ? "warn" : "ok"}`}>{NUM.format(r.sinGestion)} · {PCT(pct(r.sinGestion, r.recibidos))}</span></td>
                  <td className="num" style={{ textAlign: "right" }}>{r.sinGestion24h ? <b style={{ color: "var(--high)" }}>{NUM.format(r.sinGestion24h)}</b> : <span className="muted">0</span>}</td>
                  <td className="num" style={{ textAlign: "right" }}>{NUM.format(r.contactados)} <span className="muted" style={{ fontSize: 11.5 }}>{PCT(pct(r.contactados, r.recibidos))}</span></td>
                  <td style={{ textAlign: "right" }}><span className={`badge ${pv > 0.5 ? "high" : pv > 0.2 ? "warn" : "ok"}`}>{NUM.format(r.vencidos)} · {PCT(pv)}</span></td>
                  <td className="num" style={{ textAlign: "right" }}>{NUM.format(r.activos)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{NUM.format(r.calificados)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{NUM.format(r.descartados)}</td>
                  <td style={{ textAlign: "right" }}>{r.ventas ? <span className="badge ok">{r.ventas}</span> : <span className="muted">0</span>}</td>
                  <td className="num" style={{ textAlign: "right" }}>{NUM.format(r.acciones)}</td>
                </tr>
              );
            })}
            {filas.length === 0 && <tr><td colSpan={11} className="muted" style={{ textAlign: "center", padding: 24 }}>Sin prospectos en este período.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section-title">Leads sin gestionar (los más antiguos primero)</div>
      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead><tr><th>Lead</th><th>Proyecto</th><th>Fuente</th><th>Asesor</th><th>Llegó</th><th>Hace</th><th>Semáforo</th></tr></thead>
          <tbody>
            {sinGestion.map((p) => (
              <tr key={p.prospect_id}>
                <td><b>{p.nombre || p.prospect_id.slice(0, 8)}</b></td>
                <td className="muted">{p.proyecto}</td>
                <td className="muted">{canalCorto(p.fuente ?? "")}</td>
                <td>{p.asesor || <span className="muted">—</span>}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtFecha(p.fecha_creacion)}</td>
                <td className="num">{hace(p.fecha_creacion)}</td>
                <td><Semaforo v={p.seguimiento} /></td>
              </tr>
            ))}
            {sinGestion.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Todos los leads del período tienen al menos una gestión.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Semaforo({ v }: { v: number | null }) {
  const l = SEGUIMIENTO_LABEL(v);
  return <span className={`badge ${l.tone}`}>{l.label}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Vista Inversión y CPA
// ═══════════════════════════════════════════════════════════════════════════
function VistaInversion({ leads, inversion, proyectos, proyecto, canal, puedeEditar, onChange }: {
  leads: Lead[]; inversion: Inversion[]; proyectos: string[]; proyecto: string; canal: string; puedeEditar: boolean; onChange: () => void;
}) {
  const filas = useMemo(() => cpaPorMes(leads, inversion, proyecto, canal), [leads, inversion, proyecto, canal]);
  const hoy = new Date();
  const [f, setF] = useState({ mes: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`, proyecto: "", canal: "", monto: "", nota: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function guardar() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/marketing/inversion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, monto: Number(f.monto.replace(/[^\d.]/g, "")) }) });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(j.error ?? "Error"); return; }
    setF((v) => ({ ...v, monto: "", nota: "" }));
    onChange();
  }
  async function borrar(id: string) {
    if (!confirm("¿Eliminar este registro de inversión?")) return;
    await fetch(`/api/marketing/inversion?id=${id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <>
      <div className="info-bar"><IconInfo /><div>
        La inversión en Meta Ads se captura manualmente por mes (y opcionalmente por proyecto y canal). Con ella se calcula el costo por lead (CPL), por lead calificado y por cliente (CPA). Los filtros de proyecto y canal de arriba aplican a esta tabla.
      </div></div>

      {puedeEditar && (
        <div className="chart-card" style={{ marginBottom: 18 }}>
          <div className="chart-title">Registrar inversión</div>
          <div className="toolbar" style={{ margin: "12px 0 0" }}>
            <label className="field">Mes<input className="input" type="month" value={f.mes} onChange={(e) => setF({ ...f, mes: e.target.value })} /></label>
            <label className="field">Proyecto<select className="input select-sm" value={f.proyecto} onChange={(e) => setF({ ...f, proyecto: e.target.value })}><option value="">Todos</option>{proyectos.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
            <label className="field">Canal<select className="input select-sm" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}><option value="">Todos</option><option>Facebook</option><option>Instagram</option><option>WhatsApp</option></select></label>
            <label className="field">Monto (COP)<input className="input" inputMode="numeric" placeholder="3.500.000" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></label>
            <label className="field">Nota<input className="input" placeholder="opcional" value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} /></label>
            <button className="btn btn-primary" disabled={busy || !f.monto} onClick={() => void guardar()}><IconCoins /> Guardar</button>
          </div>
          {msg && <div className="muted" style={{ marginTop: 8, color: "var(--high)" }}>{msg}</div>}
        </div>
      )}

      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="num" style={{ textAlign: "right" }}>Inversión</th>
              <th className="num" style={{ textAlign: "right" }}>Leads</th>
              <th className="num" style={{ textAlign: "right" }}>Calificados</th>
              <th className="num" style={{ textAlign: "right" }}>Ventas</th>
              <th className="num" style={{ textAlign: "right" }}>Costo / lead</th>
              <th className="num" style={{ textAlign: "right" }}>Costo / calificado</th>
              <th className="num" style={{ textAlign: "right" }}>Costo / cliente</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((m) => (
              <tr key={m.mes}>
                <td><b>{fmtMes(m.mes)}</b></td>
                <td className="num" style={{ textAlign: "right" }}>{m.inversion ? COP.format(m.inversion) : <span className="muted">sin registrar</span>}</td>
                <td className="num" style={{ textAlign: "right" }}>{NUM.format(m.leads)}</td>
                <td className="num" style={{ textAlign: "right" }}>{NUM.format(m.calificados)}</td>
                <td className="num" style={{ textAlign: "right" }}>{NUM.format(m.ventas)}</td>
                <td className="num" style={{ textAlign: "right" }}>{m.cpl != null ? COP.format(m.cpl) : "—"}</td>
                <td className="num" style={{ textAlign: "right" }}>{m.cpc != null ? COP.format(m.cpc) : "—"}</td>
                <td className="num" style={{ textAlign: "right" }}>{m.cpa != null ? <b>{COP.format(m.cpa)}</b> : "—"}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>Sin leads ni inversión en este período.</td></tr>}
          </tbody>
        </table>
      </div>

      {inversion.length > 0 && (
        <>
          <div className="section-title">Registros de inversión</div>
          <div className="table-wrap table-scroll">
            <table className="clean">
              <thead><tr><th>Mes</th><th>Proyecto</th><th>Canal</th><th className="num" style={{ textAlign: "right" }}>Monto</th><th>Nota</th>{puedeEditar && <th />}</tr></thead>
              <tbody>
                {inversion.map((i) => (
                  <tr key={i.id}>
                    <td>{fmtMes(i.mes)}</td>
                    <td className="muted">{i.proyecto || "Todos"}</td>
                    <td className="muted">{i.canal || "Todos"}</td>
                    <td className="num" style={{ textAlign: "right" }}>{COP.format(Number(i.monto))}</td>
                    <td className="muted">{i.nota ?? ""}</td>
                    {puedeEditar && <td style={{ textAlign: "right" }}><button className="btn btn-ghost btn-sm" onClick={() => void borrar(i.id)}>Eliminar</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ─── Piezas compartidas ──────────────────────────────────────────────────────
function Kpi({ icon, label, value, foot, tone }: { icon: React.ReactNode; label: string; value: string; foot?: string; tone?: "ok" | "warn" | "high" }) {
  return (
    <div className="kpi">
      <div className="kpi-head"><span className={`kpi-ico${tone ? ` s-${tone}` : ""}`}>{icon}</span><span className="kpi-label">{label}</span></div>
      <div className="kpi-value">{value}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

function Dist({ titulo, d }: { titulo: string; d: ReturnType<typeof distribucion> }) {
  return (
    <div className="chart-card">
      <div className="chart-title">{titulo}</div>
      <div className="chart-sub">{d.conDato ? `${NUM.format(d.conDato)} con dato de ${NUM.format(d.total)}` : "Sin datos diligenciados"}</div>
      <div style={{ marginTop: 8 }}>
        {d.valores.map((v) => (
          <div className="bar-row" key={v.valor} style={{ gridTemplateColumns: "150px 1fr 90px" }}>
            <div className="bar-name" title={v.valor}>{v.valor}</div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(2, v.pct * 100)}%` }} /></div>
            <div className="bar-val"><b>{NUM.format(v.n)}</b> <span className="bar-pct">{PCT(v.pct)}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
