"use client";
import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { DateRange, rangeFor, type Range } from "../DateRange";
import { IconUsers, IconCheck, IconKey, IconAlert, IconRefresh, IconCoins, IconActivity, IconInfo, IconDownload } from "../icons";
import { exportarExcel, exportarPdf, nombreArchivo, type Reporte } from "@/lib/marketing/exportar";
import { useUsuario } from "@/lib/auth/useUsuario";
import type { Inversion, Lead, MarketingData, Prospecto, VentaCartera } from "@/lib/marketing/types";
import type { GestionAsesor } from "@/lib/marketing/compute";
import {
  agruparLeads, canalCorto, cpaPorMes, distribucion, embudo, esCompra, esContactado, esDescartado,
  gestionPorAsesor, normGenero, pct, porCreativo, rangoEdad, totalGestion, SEGUIMIENTO_LABEL, nombreLead, ventasPorProyecto, partirModulo } from "@/lib/marketing/compute";

const fechaCorta = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); };
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
    setSyncMsg("Consultando Smarthome… puede tardar 1–2 minutos. No cierres esta pestaña.");
    const inicio = Date.now();
    const exito = (j: { leads: number; prospectos: number; segundos?: number; errores?: string[] }) => {
      setSync("ok");
      setSyncMsg(`Listo: ${NUM.format(j.leads)} leads y ${NUM.format(j.prospectos)} prospectos${j.segundos ? ` en ${j.segundos}s` : ""}${j.errores?.length ? ` · avisos: ${j.errores.join("; ")}` : ""}`);
    };
    try {
      const res = await fetch("/api/marketing/sync", { method: "POST", keepalive: true });
      const j = await res.json();
      if (!res.ok || (!j.leads && !j.prospectos)) throw new Error(j.error ?? (j.errores ?? []).join("; ") ?? "sin datos");
      exito(j);
      await cargar(range);
    } catch (e) {
      // Si el navegador perdió la conexión (p. ej. "Failed to fetch"), la sincronización
      // suele seguir corriendo en el servidor: consultamos su estado hasta 4 minutos.
      const esRed = e instanceof TypeError;
      if (esRed) {
        setSyncMsg("Se perdió la conexión con el servidor; verificando si la sincronización terminó…");
        for (let i = 0; i < 24; i++) {
          await new Promise((r) => setTimeout(r, 10000));
          try {
            const r2 = await fetch("/api/marketing/sync?estado=1", { cache: "no-store" });
            const s = await r2.json();
            if (s?.ultimo_ok && new Date(s.ultimo_ok).getTime() >= inicio - 5000) {
              const d = (s.detalle ?? {}) as { leads?: number; prospectos?: number; segundos?: number; errores?: string[] };
              exito({ leads: d.leads ?? 0, prospectos: d.prospectos ?? 0, segundos: d.segundos, errores: d.errores });
              await cargar(range);
              return;
            }
          } catch { /* seguir esperando */ }
        }
      }
      setSync("err");
      setSyncMsg(`No se pudo sincronizar: ${String(e)}. Vuelve a intentarlo; si persiste, revisa la conexión con Smarthome.`);
    }
  }

  // ── Filtros en memoria ──────────────────────────────────────────────────────
  const leads = useMemo(() => (data?.leads ?? []).filter((l) => (!proyecto || l.proyecto === proyecto) && (!canal || l.canal === canal)), [data, proyecto, canal]);
  const prospectos = useMemo(() => (data?.prospectos ?? []).filter((p) => !proyecto || p.proyecto === proyecto), [data, proyecto]);
  const compradores = useMemo(() => (data?.compradores ?? []).filter((p) => !proyecto || p.proyecto === proyecto), [data, proyecto]);
  // Ventas reales (cartera): sin filtro de fecha; se respeta el filtro de proyecto
  const ventas = useMemo(() => (data?.ventas ?? []).filter((v) => !proyecto || v.project_name === proyecto), [data, proyecto]);
  const canales = useMemo(() => [...new Set((data?.leads ?? []).map((l) => l.canal).filter(Boolean))].sort(), [data]);
  // Contexto de filtros que acompaña a cada exportación (Excel/PDF)
  const contexto = useMemo(() => {
    const f = (d: Date | null) => (d ? d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : null);
    const per = range.from || range.to ? `Período (llegada del lead): ${f(range.from) ?? "inicio"} – ${f(range.to) ?? "hoy"}` : "Período: todo el histórico";
    return [per, `Proyecto: ${proyecto || "Todos"}`, vista !== "gestion" ? `Canal: ${canal ? canalCorto(canal) : "Todos"}` : "", data?.ultimoSync ? `Datos de Smarthome actualizados: ${fechaCorta(data.ultimoSync)}` : ""].filter(Boolean);
  }, [range, proyecto, canal, vista, data?.ultimoSync]);

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

      {vista === "marketing" && <VistaMarketing leads={leads} compradores={compradores} ventas={ventas} contexto={contexto} />}
      {vista === "gestion" && <VistaGestion prospectos={prospectos} contexto={contexto} />}
      {vista === "inversion" && (
        <VistaInversion leads={leads} inversion={data?.inversion ?? []} proyectos={proyectos} proyecto={proyecto} canal={canal}
          puedeEditar={usuario?.rol === "superadmin"} onChange={() => cargar(range)} contexto={contexto} />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Vista Marketing: embudo, canal, anuncio/creativo, perfil de quien compra
// ═══════════════════════════════════════════════════════════════════════════
function VistaMarketing({ leads, compradores, ventas, contexto }: { leads: Lead[]; compradores: Prospecto[]; ventas: VentaCartera[]; contexto: string[] }) {
  const porProyecto = useMemo(() => ventasPorProyecto(ventas), [ventas]);
  const [abierto, setAbierto] = useState<string | null>(null);
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

  const reporte = useMemo<Reporte>(() => {
    const totalVendido = ventas.reduce((s, v) => s + Number(v.total_valor ?? 0), 0);
    const dist = (titulo: string, d: ReturnType<typeof distribucion>) => d.valores.map((x) => [titulo, x.valor, x.n, x.pct] as (string | number)[]);
    return {
      titulo: "Marketing y leads",
      contexto,
      kpis: [
        ["Leads recibidos", NUM.format(e.contactos)], ["Calificados", `${NUM.format(e.calificados)} (${PCT(pct(e.calificados, e.contactos))})`],
        ["Oportunidades", NUM.format(e.oportunidades)], ["Ventas (leads del período)", NUM.format(e.ventas)],
        ["Vendido total (cartera)", COP.format(totalVendido)], ["Descartados", NUM.format(e.descartados)],
      ],
      tablas: [
        { titulo: "Embudo de conversión", columnas: [{ titulo: "Etapa", ancho: 3 }, { titulo: "Leads", tipo: "n" }, { titulo: "% del total", tipo: "pct" }],
          filas: pasos.map(([n, v]) => [n, v, pct(v, e.contactos)]) },
        { titulo: "Por canal", columnas: [{ titulo: "Canal", ancho: 2 }, { titulo: "Leads", tipo: "n" }, { titulo: "Calificados", tipo: "n" }, { titulo: "% calificados", tipo: "pct" }, { titulo: "Ventas", tipo: "n" }],
          filas: canales.map((c) => [canalCorto(c.clave), c.leads, c.calificados, pct(c.calificados, c.leads), c.ventas]) },
        { titulo: "Ventas reales por proyecto y agrupación (cartera)", nota: "Digitales = el comprador entró por canal digital · De campañas = además figura como lead en las campañas sincronizadas.",
          columnas: [{ titulo: "Proyecto", ancho: 2 }, { titulo: "Agrupación", ancho: 1.6 }, { titulo: "Unidades", ancho: 3 }, { titulo: "Vendidas", tipo: "n" }, { titulo: "Digitales", tipo: "n" }, { titulo: "De campañas", tipo: "n" }, { titulo: "Valor", tipo: "cop", ancho: 1.5 }, { titulo: "Última venta", ancho: 1.2 }],
          filas: porProyecto.flatMap((p) => [[p.proyecto, "TOTAL PROYECTO", "", p.total, p.digitales, p.leads, p.valor, ""], ...p.grupos.map((g) => [p.proyecto, g.grupo, g.unidades.join(", "), g.total, g.digitales, g.leads, g.valor, g.ultima ? fechaCorta(g.ultima) : ""])]),
          total: ["Total vendido", "", "", ventas.length, ventas.filter((v) => v.digital).length, ventas.filter((v) => v.lead).length, totalVendido, ""] },
        { titulo: "Ventas (detalle por unidad)", columnas: [{ titulo: "Fecha de venta", ancho: 1.2 }, { titulo: "Proyecto", ancho: 2 }, { titulo: "Agrupación", ancho: 1.4 }, { titulo: "Unidad" }, { titulo: "Cliente", ancho: 2.4 }, { titulo: "Canal", ancho: 1.4 }, { titulo: "Valor", tipo: "cop", ancho: 1.5 }],
          filas: [...ventas].sort((a, b) => (b.fecha_venta ?? "").localeCompare(a.fecha_venta ?? "")).map((v) => [v.fecha_venta ? fechaCorta(v.fecha_venta) : "", v.project_name, partirModulo(v.module).grupo, partirModulo(v.module).unidad, v.cliente ?? "", v.digital ? (v.lead ? "Digital · campaña" : "Digital") : "Otro canal", Number(v.total_valor ?? 0)]) },
        { titulo: "Leads y conversión por anuncio / creativo", columnas: [{ titulo: "Anuncio / creativo", ancho: 3.2 }, { titulo: "Tipo" }, { titulo: "Canal", ancho: 1.2 }, { titulo: "Leads", tipo: "n" }, { titulo: "Contactados", tipo: "n" }, { titulo: "Calificados", tipo: "n" }, { titulo: "% calif.", tipo: "pct" }, { titulo: "Oportun.", tipo: "n" }, { titulo: "Ventas", tipo: "n" }, { titulo: "Descartados", tipo: "n" }, { titulo: "Crédito sí", tipo: "n" }, { titulo: "Último lead", ancho: 1.3 }],
          filas: creativos.map((c) => [c.titulo, c.tipo || "", c.canales.map(canalCorto).join(", "), c.leads, c.contactados, c.calificados, pct(c.calificados, c.leads), c.oportunidades, c.ventas, c.descartados, c.creditoSi, fmtFecha(c.ultimoLead)]) },
        { titulo: "Precalificación (formulario / bot)", columnas: [{ titulo: "Pregunta", ancho: 2.2 }, { titulo: "Respuesta", ancho: 2.2 }, { titulo: "Leads", tipo: "n" }, { titulo: "% de los que respondieron", tipo: "pct" }],
          filas: [...dist("¿Cuenta con crédito aprobado?", precal.credito), ...dist("¿Empleado o independiente?", precal.empleo), ...dist("¿Reportado en centrales?", precal.reportado), ...dist("Capacidad de pago mensual", precal.capacidad), ...dist("Motivación de compra", precal.motivacion), ...dist("¿En cuánto tiempo compra?", precal.tiempo)] },
        { titulo: "Perfil de quien sí compra", nota: `${NUM.format(compradores.length)} compradores en Ciclo de Compra (histórico completo).`,
          columnas: [{ titulo: "Dato", ancho: 1.6 }, { titulo: "Valor", ancho: 2.4 }, { titulo: "Compradores", tipo: "n" }, { titulo: "%", tipo: "pct" }],
          filas: [...dist("Género", perfil.genero), ...dist("Rango de edad", perfil.edad), ...dist("Ciudad", perfil.ciudad), ...dist("Barrio", perfil.barrio), ...dist("Estado civil", perfil.civil), ...dist("Fuente", perfil.fuente), ...dist("Profesión", perfil.profesion)] },
      ],
    };
  }, [e, canales, porProyecto, ventas, creativos, precal, perfil, compradores.length, contexto]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ExportBar reporte={reporte} />
      <div className="kpis">
        <Kpi icon={<IconUsers />} label="Leads recibidos" value={NUM.format(e.contactos)} foot={`${NUM.format(e.unicos)} únicos · ${NUM.format(e.contactos - e.unicos)} repetidos`} />
        <Kpi icon={<IconActivity />} label="Calificados" value={NUM.format(e.calificados)} foot={`${PCT(pct(e.calificados, e.contactos))} de los leads`} tone="warn" />
        <Kpi icon={<IconCheck />} label="Oportunidades" value={NUM.format(e.oportunidades)} foot={`${PCT(pct(e.oportunidades, e.contactos))} de los leads`} />
        <Kpi icon={<IconKey />} label="Ventas (leads del período)" value={NUM.format(e.ventas)} foot={e.ventas ? `1 venta cada ${NUM.format(Math.round(e.contactos / e.ventas))} leads` : "sin ventas en el período"} tone="ok" />
        <Kpi icon={<IconCoins />} label="Vendido total (cartera)" value={COP.format(ventas.reduce((s, v) => s + Number(v.total_valor ?? 0), 0))} foot={`${NUM.format(ventas.length)} unidades · ${NUM.format(ventas.filter((v) => v.digital).length)} por canal digital`} tone="ok" />
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

      <div className="section-title">Ventas reales por proyecto (cartera) · {NUM.format(ventas.length)} unidades</div>
      <div className="muted" style={{ fontSize: 12.5, margin: "-6px 0 10px" }}>
        Fuente de verdad: unidades con cartera activa en Smarthome. «Digitales» = el comprador entró por canal digital; «De campañas» = además figura como lead en las campañas sincronizadas desde enero de 2026. Clic en un proyecto para ver torres, manzanas o etapas.
      </div>
      <div className="table-wrap" style={{ marginBottom: 18 }}>
        <table className="clean">
          <thead>
            <tr><th>Proyecto / agrupación</th><th style={{ textAlign: "right" }}>Unidades vendidas</th><th style={{ textAlign: "right" }}>Digitales</th><th style={{ textAlign: "right" }}>De campañas</th><th style={{ textAlign: "right" }}>Valor total</th></tr>
          </thead>
          <tbody>
            {porProyecto.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 18 }}>Sin ventas en cartera para el filtro actual.</td></tr>}
            {porProyecto.map((p) => (
              <Fragment key={p.proyecto}>
                <tr style={{ cursor: "pointer", background: "var(--surface-2)" }} onClick={() => setAbierto(abierto === p.proyecto ? null : p.proyecto)}>
                  <td><b>{abierto === p.proyecto ? "▾" : "▸"} {p.proyecto}</b> <span className="muted" style={{ fontSize: 12 }}>· {p.grupos.length} {/manzana/i.test(p.grupos[0]?.grupo ?? "") ? "manzanas" : /torre/i.test(p.grupos[0]?.grupo ?? "") ? "torres" : "grupos"}</span></td>
                  <td className="num" style={{ textAlign: "right" }}><b>{NUM.format(p.total)}</b></td>
                  <td className="num" style={{ textAlign: "right" }}>{NUM.format(p.digitales)} <span className="muted">({PCT(pct(p.digitales, p.total))})</span></td>
                  <td className="num" style={{ textAlign: "right" }}>{NUM.format(p.leads)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(p.valor)}</td>
                </tr>
                {abierto === p.proyecto && p.grupos.map((g) => (
                  <tr key={p.proyecto + g.grupo}>
                    <td style={{ paddingLeft: 32 }}>{g.grupo} <span className="muted" style={{ fontSize: 12 }}>· {g.unidades.slice(0, 12).join(", ")}{g.unidades.length > 12 ? ` y ${g.unidades.length - 12} más` : ""}{g.ultima ? ` · última venta ${fechaCorta(g.ultima)}` : ""}</span></td>
                    <td className="num" style={{ textAlign: "right" }}>{NUM.format(g.total)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{NUM.format(g.digitales)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{NUM.format(g.leads)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{COP.format(g.valor)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {porProyecto.length > 0 && (
              <tr style={{ background: "var(--brand-soft)" }}>
                <td><b>Total vendido</b></td>
                <td className="num" style={{ textAlign: "right" }}><b>{NUM.format(ventas.length)}</b></td>
                <td className="num" style={{ textAlign: "right" }}><b>{NUM.format(ventas.filter((v) => v.digital).length)}</b> <span className="muted">({PCT(pct(ventas.filter((v) => v.digital).length, ventas.length))})</span></td>
                <td className="num" style={{ textAlign: "right" }}><b>{NUM.format(ventas.filter((v) => v.lead).length)}</b></td>
                <td className="num" style={{ textAlign: "right" }}><b>{COP.format(ventas.reduce((s, v) => s + Number(v.total_valor ?? 0), 0))}</b></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="section-title">Últimas ventas (por fecha de cierre)</div>
      <div className="table-wrap" style={{ marginBottom: 18 }}>
        <table className="clean">
          <thead><tr><th>Fecha de venta</th><th>Proyecto</th><th>Unidad</th><th>Cliente</th><th>Canal</th><th style={{ textAlign: "right" }}>Valor</th></tr></thead>
          <tbody>
            {[...ventas].sort((a, b) => (b.fecha_venta ?? "").localeCompare(a.fecha_venta ?? "")).slice(0, 20).map((v, i) => (
              <tr key={(v.prospect_id ?? "") + v.module + i}>
                <td><b>{v.fecha_venta ? fechaCorta(v.fecha_venta) : "—"}</b></td>
                <td>{v.project_name}</td>
                <td>{partirModulo(v.module).grupo} · {partirModulo(v.module).unidad}</td>
                <td className="muted">{v.cliente ?? "—"}</td>
                <td>{v.digital ? <span className="badge ok">Digital{v.lead ? " · campaña" : ""}</span> : <span className="badge" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>Otro canal</span>}</td>
                <td className="num" style={{ textAlign: "right" }}>{COP.format(Number(v.total_valor ?? 0))}</td>
              </tr>
            ))}
            {ventas.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 18 }}>Sin ventas registradas.</td></tr>}
          </tbody>
        </table>
        {ventas.length > 20 && <div className="muted" style={{ fontSize: 12, padding: "8px 14px" }}>Se muestran las 20 más recientes de {NUM.format(ventas.length)}.</div>}
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
                    <Miniatura src={c.miniatura} tipo={c.tipo} />
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
function VistaGestion({ prospectos, contexto }: { prospectos: Prospecto[]; contexto: string[] }) {
  const filas = useMemo(() => gestionPorAsesor(prospectos), [prospectos]);
  const t = useMemo(() => totalGestion(filas), [filas]);
  const vivos = t.recibidos - t.ventas - t.descartados;

  // ── Leads sin gestionar: filtros propios (proyecto / fechas), gráfica por período y paginación ──
  const [sgProyecto, setSgProyecto] = useState("");
  const [sgDesde, setSgDesde] = useState("");
  const [sgHasta, setSgHasta] = useState("");
  const [sgAgrup, setSgAgrup] = useState<"semana" | "mes" | "anio">("mes");
  const [sgPagina, setSgPagina] = useState(1);
  const SG_PAGE = 10;
  const sgProyectos = useMemo(() => [...new Set(prospectos.map((p) => p.proyecto ?? "").filter(Boolean))].sort(), [prospectos]);
  const enFiltro = (p: Prospecto) => (!sgProyecto || p.proyecto === sgProyecto) && (!sgDesde || (p.fecha_creacion ?? "") >= sgDesde) && (!sgHasta || (p.fecha_creacion ?? "").slice(0, 10) <= sgHasta);
  const sgRecibidos = useMemo(() => prospectos.filter(enFiltro), [prospectos, sgProyecto, sgDesde, sgHasta]); // eslint-disable-line react-hooks/exhaustive-deps
  const sinGestionTodos = useMemo(() => sgRecibidos
    .filter((p) => !esCompra(p.ciclo, p.etapa, p.es_venta) && !esDescartado(p.ciclo) && !esContactado(p.etapa, p.acciones))
    .sort((a, b) => (a.fecha_creacion ?? "").localeCompare(b.fecha_creacion ?? "")), [sgRecibidos]);
  useEffect(() => { setSgPagina(1); }, [sgProyecto, sgDesde, sgHasta, prospectos]);
  const sgTotalPag = Math.max(1, Math.ceil(sinGestionTodos.length / SG_PAGE));
  const sgPag = Math.min(sgPagina, sgTotalPag);
  const sinGestion = useMemo(() => sinGestionTodos.slice((sgPag - 1) * SG_PAGE, sgPag * SG_PAGE), [sinGestionTodos, sgPag]);
  // Serie por período: sin gestionar vs recibidos
  const periodoDe = (iso: string | null | undefined): { key: string; label: string } | null => {
    if (!iso) return null; const d = new Date(iso); if (isNaN(d.getTime())) return null;
    const y = d.getFullYear(), m = d.getMonth();
    if (sgAgrup === "anio") return { key: String(y), label: String(y) };
    if (sgAgrup === "mes") return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label: d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }) };
    const lunes = new Date(d); lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7)); lunes.setHours(0, 0, 0, 0);
    return { key: lunes.toISOString().slice(0, 10), label: `S ${lunes.toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}` };
  };
  const serieSg = useMemo(() => {
    const m = new Map<string, { key: string; label: string; recibidos: number; sinGestion: number }>();
    for (const p of sgRecibidos) { const k = periodoDe(p.fecha_creacion); if (!k) continue; const e = m.get(k.key) ?? { ...k, recibidos: 0, sinGestion: 0 }; e.recibidos++; m.set(k.key, e); }
    for (const p of sinGestionTodos) { const k = periodoDe(p.fecha_creacion); if (!k) continue; const e = m.get(k.key); if (e) e.sinGestion++; }
    const arr = [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
    return sgAgrup === "semana" ? arr.slice(-26) : sgAgrup === "mes" ? arr.slice(-24) : arr;
  }, [sgRecibidos, sinGestionTodos, sgAgrup]); // eslint-disable-line react-hooks/exhaustive-deps
  const sgMax = Math.max(1, ...serieSg.map((s) => s.recibidos));

  const reporte = useMemo<Reporte>(() => {
    const filaAsesor = (r: GestionAsesor) => [r.asesor, r.recibidos, r.sinGestion, r.sinGestion24h, r.contactados, r.vencidos, r.activos, r.calificados, r.descartados, r.ventas, r.acciones];
    const ctxSg = [sgProyecto ? `Proyecto (sin gestionar): ${sgProyecto}` : "", sgDesde || sgHasta ? `Llegaron entre ${sgDesde || "inicio"} y ${sgHasta || "hoy"}` : ""].filter(Boolean).join(" · ");
    return {
      titulo: "Gestión comercial",
      contexto,
      kpis: [["Leads recibidos", NUM.format(t.recibidos)], ["Sin gestión", `${NUM.format(t.sinGestion)} (${PCT(pct(t.sinGestion, t.recibidos))})`], ["Sin gestión > 24 h", NUM.format(t.sinGestion24h)], ["Tareas vencidas", NUM.format(t.vencidos)], ["Calificados", NUM.format(t.calificados)], ["Ventas", NUM.format(t.ventas)]],
      tablas: [
        { titulo: "Gestión por asesor", columnas: [{ titulo: "Asesor", ancho: 2.4 }, { titulo: "Recibidos", tipo: "n" }, { titulo: "Sin gestión", tipo: "n" }, { titulo: "> 24 h", tipo: "n" }, { titulo: "Contactados", tipo: "n" }, { titulo: "Vencidos", tipo: "n" }, { titulo: "Activos", tipo: "n" }, { titulo: "Calificados", tipo: "n" }, { titulo: "Descartados", tipo: "n" }, { titulo: "Ventas", tipo: "n" }, { titulo: "Acciones", tipo: "n" }],
          filas: filas.map(filaAsesor), total: ["Total", t.recibidos, t.sinGestion, t.sinGestion24h, t.contactados, t.vencidos, t.activos, t.calificados, t.descartados, t.ventas, t.acciones] },
        { titulo: `Leads no atendidos por ${sgAgrup === "semana" ? "semana" : sgAgrup === "mes" ? "mes" : "año"}`, nota: ctxSg || undefined,
          columnas: [{ titulo: "Período", ancho: 1.5 }, { titulo: "Recibidos", tipo: "n" }, { titulo: "Sin gestionar", tipo: "n" }, { titulo: "% sin gestionar", tipo: "pct" }],
          filas: serieSg.map((s) => [s.label, s.recibidos, s.sinGestion, pct(s.sinGestion, s.recibidos)]),
          total: ["Total", sgRecibidos.length, sinGestionTodos.length, pct(sinGestionTodos.length, sgRecibidos.length)] },
        { titulo: "Leads sin gestionar (los más antiguos primero)", nota: ctxSg || undefined,
          columnas: [{ titulo: "Lead", ancho: 2.4 }, { titulo: "Proyecto", ancho: 1.8 }, { titulo: "Fuente", ancho: 1.3 }, { titulo: "Asesor", ancho: 1.8 }, { titulo: "Llegó", ancho: 1.3 }, { titulo: "Hace" }, { titulo: "Semáforo", ancho: 1.2 }, { titulo: "ID Smarthome", ancho: 1.2 }],
          filas: sinGestionTodos.map((p) => [nombreLead(p).texto, p.proyecto ?? "", canalCorto(p.fuente ?? ""), p.asesor, fmtFecha(p.fecha_creacion), hace(p.fecha_creacion), SEGUIMIENTO_LABEL(p.seguimiento).label, p.prospect_id]) },
      ],
    };
  }, [filas, t, serieSg, sinGestionTodos, sgRecibidos.length, sgAgrup, sgProyecto, sgDesde, sgHasta, contexto]);

  return (
    <>
      <ExportBar reporte={reporte} />
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

      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>Leads sin gestionar</span>
        <span className="topbar-spacer" style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12.5, textTransform: "none", letterSpacing: 0 }}>{NUM.format(sinGestionTodos.length)} sin atender de {NUM.format(sgRecibidos.length)} recibidos ({PCT(pct(sinGestionTodos.length, sgRecibidos.length))})</span>
      </div>
      <div className="toolbar" style={{ alignItems: "flex-end", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <label className="field" style={{ minWidth: 200 }}>Proyecto
          <select className="input" value={sgProyecto} onChange={(e) => setSgProyecto(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {sgProyectos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field">Llegaron desde<input className="input" type="date" value={sgDesde} onChange={(e) => setSgDesde(e.target.value)} /></label>
        <label className="field">Hasta<input className="input" type="date" value={sgHasta} onChange={(e) => setSgHasta(e.target.value)} /></label>
        {(sgProyecto || sgDesde || sgHasta) && <button className="btn btn-ghost btn-sm" onClick={() => { setSgProyecto(""); setSgDesde(""); setSgHasta(""); }}>Limpiar filtros</button>}
        <span className="topbar-spacer" style={{ flex: 1 }} />
        <div className="segmented">
          {([["semana", "Por semana"], ["mes", "Por mes"], ["anio", "Por año"]] as const).map(([k, l]) => (
            <button key={k} className={`seg${sgAgrup === k ? " active" : ""}`} onClick={() => setSgAgrup(k)}>{l}</button>
          ))}
        </div>
      </div>

      {/* Gráfica: leads sin gestionar por período (barra clara = recibidos, barra oscura = sin gestionar) */}
      <div className="chart-card" style={{ marginBottom: 18 }}>
        <div className="chart-title">Leads no atendidos por {sgAgrup === "semana" ? "semana" : sgAgrup === "mes" ? "mes" : "año"}</div>
        <div className="chart-sub">Barra clara = leads recibidos en el período · barra oscura = los que siguen sin ninguna gestión. Los períodos se calculan por la fecha en que llegó el lead.</div>
        {serieSg.length === 0 ? <div className="muted" style={{ padding: 12 }}>Sin datos para el filtro.</div> : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${serieSg.length}, minmax(0, 1fr))`, gap: 6, alignItems: "end", height: 190, padding: "8px 4px 0" }}>
            {serieSg.map((s) => (
              <div key={s.key} title={`${s.label}: ${s.sinGestion} sin gestionar de ${s.recibidos} recibidos (${PCT(pct(s.sinGestion, s.recibidos))})`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", minWidth: 0 }}>
                <span className="num" style={{ fontSize: 11, fontWeight: 700, color: s.sinGestion ? "var(--high)" : "var(--muted)", marginBottom: 2 }}>{s.sinGestion}</span>
                <div style={{ position: "relative", width: "100%", height: `${Math.max(2, (s.recibidos / sgMax) * 140)}px`, background: "var(--brand-soft)", borderRadius: "4px 4px 0 0" }}>
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${s.recibidos ? (s.sinGestion / s.recibidos) * 100 : 0}%`, background: "var(--high)", borderRadius: "4px 4px 0 0", opacity: .85 }} />
                </div>
                <span className="muted" style={{ fontSize: 10.5, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead><tr><th>Lead</th><th>Proyecto</th><th>Fuente</th><th>Asesor</th><th>Llegó</th><th>Hace</th><th>Semáforo</th></tr></thead>
          <tbody>
            {sinGestion.map((p) => (
              <tr key={p.prospect_id}>
                <td title={nombreLead(p).original || undefined}>
                  {(() => { const n = nombreLead(p); return n.sinNombre ? <span className="muted" title={n.original ? `Texto recibido: ${n.original}` : "El lead no dejó nombre"}>{n.texto}</span> : <b>{n.texto}</b>; })()}
                </td>
                <td className="muted">{p.proyecto}</td>
                <td className="muted">{canalCorto(p.fuente ?? "")}</td>
                <td>{p.asesor || <span className="muted">—</span>}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtFecha(p.fecha_creacion)}</td>
                <td className="num">{hace(p.fecha_creacion)}</td>
                <td><Semaforo v={p.seguimiento} /></td>
              </tr>
            ))}
            {sinGestion.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Todos los leads del filtro tienen al menos una gestión.</td></tr>}
          </tbody>
        </table>
      </div>
      {sinGestionTodos.length > SG_PAGE && (
        <div className="pager">
          <span className="muted">Mostrando {(sgPag - 1) * SG_PAGE + 1}–{Math.min(sinGestionTodos.length, sgPag * SG_PAGE)} de {NUM.format(sinGestionTodos.length)} leads sin gestionar</span>
          <span className="topbar-spacer" style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" disabled={sgPag <= 1} onClick={() => setSgPagina(sgPag - 1)}>‹ Anterior</button>
          {[...new Set([1, sgTotalPag, sgPag - 1, sgPag, sgPag + 1])].filter((p) => p >= 1 && p <= sgTotalPag).sort((a, b) => a - b).map((p, i, arr) => (
            <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {i > 0 && arr[i - 1] !== p - 1 && <span className="muted">…</span>}
              <button className={`btn btn-sm ${p === sgPag ? "btn-primary" : "btn-ghost"}`} onClick={() => setSgPagina(p)}>{p}</button>
            </span>
          ))}
          <button className="btn btn-ghost btn-sm" disabled={sgPag >= sgTotalPag} onClick={() => setSgPagina(sgPag + 1)}>Siguiente ›</button>
        </div>
      )}
    </>
  );
}

/** Miniatura del anuncio; si el enlace caducó (CDN de Facebook) muestra el marcador en lugar de una imagen rota. */
function Miniatura({ src, tipo }: { src: string; tipo: string }) {
  const [rota, setRota] = useState(false);
  useEffect(() => { setRota(false); }, [src]);
  if (!src || rota) return <span className="avatar" style={{ flex: "none" }} title={src ? "La imagen del anuncio ya no está disponible" : undefined}>{tipo === "video" ? "▶" : "AD"}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={44} height={44} style={{ objectFit: "cover", borderRadius: 6, flex: "none", background: "var(--surface-2)" }} referrerPolicy="no-referrer" onError={() => setRota(true)} />;
}

function Semaforo({ v }: { v: number | null }) {
  const l = SEGUIMIENTO_LABEL(v);
  return <span className={`badge ${l.tone}`}>{l.label}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Vista Inversión y CPA
// ═══════════════════════════════════════════════════════════════════════════
function VistaInversion({ leads, inversion, proyectos, proyecto, canal, puedeEditar, onChange, contexto }: {
  leads: Lead[]; inversion: Inversion[]; proyectos: string[]; proyecto: string; canal: string; puedeEditar: boolean; onChange: () => void; contexto: string[];
}) {
  const filas = useMemo(() => cpaPorMes(leads, inversion, proyecto, canal), [leads, inversion, proyecto, canal]);
  const reporte = useMemo<Reporte>(() => {
    const inv = filas.reduce((s, m) => s + m.inversion, 0), L = filas.reduce((s, m) => s + m.leads, 0), C = filas.reduce((s, m) => s + m.calificados, 0), V = filas.reduce((s, m) => s + m.ventas, 0);
    return {
      titulo: "Inversión y CPA",
      contexto,
      kpis: [["Inversión registrada", COP.format(inv)], ["Leads", NUM.format(L)], ["Calificados", NUM.format(C)], ["Ventas", NUM.format(V)], ["Costo por lead", L && inv ? COP.format(inv / L) : "—"], ["Costo por cliente", V && inv ? COP.format(inv / V) : "—"]],
      tablas: [
        { titulo: "Costo por lead, calificado y cliente por mes", columnas: [{ titulo: "Mes", ancho: 1.2 }, { titulo: "Inversión", tipo: "cop", ancho: 1.4 }, { titulo: "Leads", tipo: "n" }, { titulo: "Calificados", tipo: "n" }, { titulo: "Ventas", tipo: "n" }, { titulo: "Costo / lead", tipo: "cop", ancho: 1.3 }, { titulo: "Costo / calificado", tipo: "cop", ancho: 1.3 }, { titulo: "Costo / cliente", tipo: "cop", ancho: 1.3 }],
          filas: filas.map((m) => [fmtMes(m.mes), m.inversion || null, m.leads, m.calificados, m.ventas, m.cpl, m.cpc, m.cpa]),
          total: ["Total", inv, L, C, V, L && inv ? inv / L : null, C && inv ? inv / C : null, V && inv ? inv / V : null] },
        { titulo: "Registros de inversión", columnas: [{ titulo: "Mes" }, { titulo: "Proyecto", ancho: 2 }, { titulo: "Canal", ancho: 1.4 }, { titulo: "Monto", tipo: "cop", ancho: 1.4 }, { titulo: "Nota", ancho: 3 }],
          filas: inversion.map((i) => [fmtMes(i.mes), i.proyecto || "Todos", i.canal ? canalCorto(i.canal) : "Todos", Number(i.monto), i.nota ?? ""]) },
      ],
    };
  }, [filas, inversion, contexto]);
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
      <ExportBar reporte={reporte} />
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
/** Botones «Exportar esta pestaña» a Excel / PDF con los filtros vigentes. */
function ExportBar({ reporte }: { reporte: Reporte }) {
  const [busy, setBusy] = useState<"" | "xlsx" | "pdf">("");
  const [err, setErr] = useState("");
  const run = async (k: "xlsx" | "pdf") => {
    setBusy(k); setErr("");
    try { if (k === "xlsx") await exportarExcel(reporte, nombreArchivo(reporte.titulo)); else await exportarPdf(reporte, nombreArchivo(reporte.titulo)); }
    catch (e) { console.error(e); setErr("No se pudo generar el archivo. Intenta de nuevo."); }
    finally { setBusy(""); }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
      <span className="muted" style={{ fontSize: 12.5 }}>Exportar esta pestaña con los filtros actuales:</span>
      <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void run("xlsx")}><IconDownload /> {busy === "xlsx" ? "Generando…" : "Excel"}</button>
      <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void run("pdf")}><IconDownload /> {busy === "pdf" ? "Generando…" : "PDF"}</button>
      {err && <span style={{ color: "var(--high)", fontSize: 12.5 }}>{err}</span>}
    </div>
  );
}

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
