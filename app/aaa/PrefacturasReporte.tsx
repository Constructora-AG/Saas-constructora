"use client";
// ════════════════════════════════════════════════════════════════════
// Reportes de prefacturas (Proyecto Triple A → Prefacturas)
// - Por ítems: líneas de las prefacturas agrupadas por ítem y ruta del pliego /
//   zona, separadas por recargo (sin recargo / nocturno / dominical / ambos).
//   El concepto de Transporte AAA es «<ítem> - <ruta> + recargo …» (así lo arma
//   Registros al prefacturar); los ítems Herpro sin zona quedan con ruta «—».
// - Por interventor: totales de cada interventor y descarga separada.
// Filtros: rango de fechas, contrato, área AAA, interventor y estado.
// ════════════════════════════════════════════════════════════════════

import { Fragment, useMemo, useState } from "react";
import { CONTRATO_LABEL, itemConZona, ivaPctDe, zonaDeTarifa, type PrefacturaItem, type PrefacturaRow } from "@/lib/aaa/catalogo";
import { CORTE } from "@/lib/aaa/compute";
import { downloadBlob, rowsToCSV } from "@/lib/transporte/export";
import { slugify } from "@/lib/transporte/logic";
import { TARIFARIO_ALQUILER_DEFAULT } from "@/lib/transporte/constants";
import { IconDownload } from "../icons";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CONDICIONES = [
  { id: "normal", label: "Sin recargo" },
  { id: "nocturno", label: "Nocturno" },
  { id: "dominical", label: "Dominical / festivo" },
  { id: "ambos", label: "Nocturno + dominical" },
] as const;
type CondId = (typeof CONDICIONES)[number]["id"];

interface Celda { lineas: number; cantidad: number; unidades: Set<string>; valor: number }
const celdaVacia = (): Celda => ({ lineas: 0, cantidad: 0, unidades: new Set(), valor: 0 });
const nuevasCeldas = (): Record<CondId, Celda> => ({ normal: celdaVacia(), nocturno: celdaVacia(), dominical: celdaVacia(), ambos: celdaVacia() });
interface FilaRuta { key: string; label: string; celdas: Record<CondId, Celda>; total: Celda }
interface GrupoItem { key: string; label: string; rutas: FilaRuta[]; celdas: Record<CondId, Celda>; total: Celda }

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function rangoRapido(id: "mes" | "anterior" | "todo"): [string, string] {
  if (id === "todo") return ["", ""];
  const hoy = new Date();
  const m = id === "mes" ? hoy.getMonth() : hoy.getMonth() - 1;
  return [isoOf(new Date(hoy.getFullYear(), m, 1)), isoOf(new Date(hoy.getFullYear(), m + 1, 0))];
}
const fmtFecha = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };
const contratoLabel = (c: string) => CONTRATO_LABEL[c] ?? c;
const ivaDe = (r: PrefacturaRow, it: PrefacturaItem) => it.iva_pct ?? ivaPctDe(r.contrato, CORTE.iva_pct);

// Contrato de Alquiler: los ítems que no escriben la zona la toman del valor unitario (igual que el PDF).
const UNITARIOS_ALQ = new Map<number, string>();
TARIFARIO_ALQUILER_DEFAULT.categorias.forEach((c) => c.rutas.forEach((rt) => UNITARIOS_ALQ.set(Math.round(Number(rt.unitario)), zonaDeTarifa(rt.label))));
const conceptoDe = (r: PrefacturaRow, it: PrefacturaItem) =>
  r.contrato === "alquiler" ? itemConZona(String(it.item ?? ""), Number(it.vr_unit), UNITARIOS_ALQ) : String(it.item ?? "");

/** Ítem, ruta del pliego / zona y recargos a partir del concepto de la línea. */
function partesConcepto(texto: string): { item: string; ruta: string; cond: CondId } {
  const noct = /recargo nocturno/i.test(texto);
  const dom = /recargo dominical/i.test(texto);
  const base = texto.replace(/\s*\+\s*recargo (nocturno|dominical(\/festivo)?)/gi, "").trim();
  const i = base.indexOf(" - ");
  return {
    item: i > 0 ? base.slice(0, i).trim() : base,
    ruta: i > 0 ? base.slice(i + 3).trim() : "—",
    cond: noct && dom ? "ambos" : noct ? "nocturno" : dom ? "dominical" : "normal",
  };
}

/** Agrupa las líneas de las prefacturas por contrato · ítem → ruta → recargo. */
function agruparPorItems(rows: PrefacturaRow[]) {
  const grupos = new Map<string, GrupoItem>();
  const total = { celdas: nuevasCeldas(), total: celdaVacia() };
  const sumar = (c: Celda, it: PrefacturaItem) => {
    c.lineas += 1; c.cantidad += Number(it.cantidad) || 0; c.valor += Number(it.valor_base) || 0;
    if (it.unidad) c.unidades.add(it.unidad);
  };
  for (const r of rows) {
    for (const it of (r.items ?? []) as PrefacturaItem[]) {
      const p = partesConcepto(conceptoDe(r, it));
      const gKey = `${r.contrato}|${p.item.toUpperCase()}`;
      let g = grupos.get(gKey);
      if (!g) { g = { key: gKey, label: `${contratoLabel(r.contrato)} · ${p.item}`, rutas: [], celdas: nuevasCeldas(), total: celdaVacia() }; grupos.set(gKey, g); }
      let f = g.rutas.find((x) => x.key === p.ruta.toUpperCase());
      if (!f) { f = { key: p.ruta.toUpperCase(), label: p.ruta, celdas: nuevasCeldas(), total: celdaVacia() }; g.rutas.push(f); }
      [f.celdas[p.cond], f.total, g.celdas[p.cond], g.total, total.celdas[p.cond], total.total].forEach((c) => sumar(c, it));
    }
  }
  const lista = [...grupos.values()].sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }));
  lista.forEach((g) => g.rutas.sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true })));
  return { grupos: lista, total };
}

const cantidadTxt = (c: Celda) =>
  `${c.cantidad.toLocaleString("es-CO", { maximumFractionDigits: 2 })}${c.unidades.size === 1 ? ` ${[...c.unidades][0]}` : ""}`;

/** Filas planas del reporte por ítems (para Excel / CSV). */
function filasItems(rep: ReturnType<typeof agruparPorItems>) {
  const fila = (item: string, ruta: string, celdas: Record<CondId, Celda>, tot: Celda) => {
    const r: Record<string, string | number> = { "Ítem": item, "Ruta del pliego / zona": ruta };
    CONDICIONES.forEach((c) => { r[`${c.label} · cantidad`] = celdas[c.id].cantidad; r[`${c.label} · valor`] = celdas[c.id].valor; });
    r["Total · cantidad"] = tot.cantidad;
    r["Total · valor"] = tot.valor;
    return r;
  };
  const filas: Array<{ datos: Record<string, string | number>; tipo: "ruta" | "item" | "total" }> = [];
  rep.grupos.forEach((g) => {
    g.rutas.forEach((r) => filas.push({ datos: fila(g.label, r.label, r.celdas, r.total), tipo: "ruta" }));
    filas.push({ datos: fila(`Subtotal ${g.label}`, "", g.celdas, g.total), tipo: "item" });
  });
  filas.push({ datos: fila("TOTAL", "", rep.total.celdas, rep.total.total), tipo: "total" });
  return filas;
}

type ExcelMod = typeof import("exceljs");
type Hoja = import("exceljs").Worksheet;

function encabezado(ws: Hoja, fila: number) {
  const head = ws.getRow(fila);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123A7A" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 32;
}

export function PrefacturasReporte({ rows, estados, conIvaDe, areas, interventores }: {
  rows: PrefacturaRow[];
  estados: Record<string, { label: string }>;
  conIvaDe: (r: PrefacturaRow) => number;
  areas: string[];
  interventores: string[];
}) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [segun, setSegun] = useState<"periodo" | "generacion">("periodo");
  const [contrato, setContrato] = useState("");
  const [area, setArea] = useState("");
  const [interventor, setInterventor] = useState("");
  const [estado, setEstado] = useState("sin_rechazadas");
  const [vista, setVista] = useState<"items" | "interventor">("items");
  const [exportando, setExportando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  const contratos = useMemo(() => [...new Set(rows.map((r) => r.contrato))].sort(), [rows]);
  const areasOpc = useMemo(() => [...new Set([...areas, ...rows.map((r) => r.area_aaa || "").filter(Boolean)])].sort((a, b) => a.localeCompare(b, "es")), [areas, rows]);
  const intervOpc = useMemo(() => [...new Set([...interventores, ...rows.map((r) => (r.interventor || "").trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "es")), [interventores, rows]);

  const filtradas = useMemo(() => rows.filter((r) => {
    // Período del servicio (se cruza con el rango) o fecha de generación de la prefactura.
    const ini = segun === "periodo" ? r.periodo_desde || r.fecha_generacion : r.fecha_generacion;
    const fin = segun === "periodo" ? r.periodo_hasta || r.periodo_desde || r.fecha_generacion : r.fecha_generacion;
    if (desde && fin < desde) return false;
    if (hasta && ini > hasta) return false;
    if (contrato && r.contrato !== contrato) return false;
    if (area && (r.area_aaa || "") !== area) return false;
    if (interventor && (r.interventor || "").trim() !== interventor) return false;
    if (estado === "sin_rechazadas" ? r.estado === "rechazada" : estado && r.estado !== estado) return false;
    return true;
  }).sort((a, b) => a.fecha_generacion.localeCompare(b.fecha_generacion) || a.numero.localeCompare(b.numero, "es", { numeric: true })), [rows, desde, hasta, segun, contrato, area, interventor, estado]);

  const reporte = useMemo(() => agruparPorItems(filtradas), [filtradas]);

  const SIN_INTERVENTOR = "(sin interventor)";
  const porInterventor = useMemo(() => {
    const m = new Map<string, PrefacturaRow[]>();
    filtradas.forEach((r) => { const k = (r.interventor || "").trim() || SIN_INTERVENTOR; m.set(k, [...(m.get(k) ?? []), r]); });
    return [...m.entries()]
      .map(([nombre, lista]) => ({ nombre, lista, base: lista.reduce((s, r) => s + Number(r.valor_base), 0), conIva: lista.reduce((s, r) => s + conIvaDe(r), 0) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [filtradas, conIvaDe]);

  const totalBase = filtradas.reduce((s, r) => s + Number(r.valor_base), 0);
  const totalIva = filtradas.reduce((s, r) => s + conIvaDe(r), 0);
  const rangoTxt = desde || hasta ? `${desde ? fmtFecha(desde) : "inicio"} a ${hasta ? fmtFecha(hasta) : "hoy"}` : "todas las fechas";
  const alcanceTxt = [
    `${segun === "periodo" ? "Período del servicio" : "Fecha de la prefactura"}: ${rangoTxt}`,
    contrato ? `Contrato: ${contratoLabel(contrato)}` : "",
    area ? `Área AAA: ${area}` : "",
    interventor ? `Interventor: ${interventor}` : "",
    estado === "sin_rechazadas" ? "Sin rechazadas" : estado ? `Estado: ${estados[estado]?.label ?? estado}` : "",
  ].filter(Boolean).join(" · ");
  const sufijo = `${area ? `_${slugify(area)}` : ""}_${desde || "inicio"}_a_${hasta || "hoy"}`;

  const filaPrefactura = (r: PrefacturaRow): Record<string, string | number> => ({
    "N°": r.numero,
    "Fecha": r.fecha_generacion,
    "Contrato": contratoLabel(r.contrato),
    "Área AAA": r.area_aaa || "",
    "Interventor": r.interventor || "",
    "Período": r.periodo || "",
    "Lugar": r.lugar || "",
    "Estado": estados[r.estado]?.label ?? r.estado,
    "Factura": r.numero_factura || "",
    "Valor sin IVA": Number(r.valor_base),
    "Con IVA": Math.round(conIvaDe(r)),
  });
  const filaLinea = (r: PrefacturaRow, it: PrefacturaItem): Record<string, string | number> => {
    const p = partesConcepto(conceptoDe(r, it));
    return {
      "Prefactura": r.numero, "Fecha": r.fecha_generacion, "Contrato": contratoLabel(r.contrato), "Interventor": r.interventor || "",
      "Ítem": p.item, "Ruta del pliego / zona": p.ruta, "Recargo": CONDICIONES.find((c) => c.id === p.cond)!.label,
      "Cantidad": Number(it.cantidad), "Unidad": it.unidad, "Tarifa": Number(it.vr_unit), "Valor sin IVA": Number(it.valor_base),
      "IVA %": Math.round(ivaDe(r, it) * 100),
    };
  };

  /** Libro Excel con hojas: Por ítems, Prefacturas y Detalle de ítems. */
  const libroExcel = async (lista: PrefacturaRow[], titulo: string) => {
    const mod = await import("exceljs");
    const ExcelJS = (mod as unknown as { default?: ExcelMod }).default ?? mod;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Proyecto Triple A — Prefacturas";
    const rep = agruparPorItems(lista);

    const ws = wb.addWorksheet("Por ítems", { views: [{ state: "frozen", ySplit: 3, xSplit: 2 }] });
    ws.addRow([titulo]).font = { bold: true, size: 13 };
    ws.addRow([alcanceTxt]);
    const filas = filasItems(rep);
    const headers = Object.keys(filas[0].datos);
    ws.addRow(headers);
    encabezado(ws, 3);
    filas.forEach((f) => {
      const row = ws.addRow(headers.map((h) => f.datos[h]));
      if (f.tipo !== "ruta") {
        row.font = { bold: true };
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: f.tipo === "total" ? "FFD5E0F2" : "FFE8EEF7" } };
      }
    });
    headers.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      col.width = i === 0 ? 46 : i === 1 ? 34 : 14;
      if (h.endsWith("· valor")) col.numFmt = '"$"#,##0';
      if (h.endsWith("· cantidad")) col.numFmt = "#,##0.##";
    });

    const tabla = (nombre: string, datos: Array<Record<string, string | number>>, moneda: string[]) => {
      if (!datos.length) return;
      const h = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
      const cols = Object.keys(datos[0]);
      h.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 4)) }));
      datos.forEach((d) => h.addRow(d));
      encabezado(h, 1);
      moneda.forEach((c) => { h.getColumn(c).numFmt = '"$"#,##0'; });
      const tot = h.addRow({ [cols[0]]: "TOTAL", ...Object.fromEntries(moneda.filter((c) => c !== "Tarifa").map((c) => [c, datos.reduce((s, d) => s + Number(d[c] || 0), 0)])) });
      tot.font = { bold: true };
      tot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
    };
    tabla("Prefacturas", lista.map(filaPrefactura), ["Valor sin IVA", "Con IVA"]);
    tabla("Detalle de ítems", lista.flatMap((r) => ((r.items ?? []) as PrefacturaItem[]).map((it) => filaLinea(r, it))), ["Tarifa", "Valor sin IVA"]);
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf as BlobPart], { type: XLSX_MIME });
  };

  const descargar = async (lista: PrefacturaRow[], fmt: "xlsx" | "csv", base: string, titulo: string) => {
    if (fmt === "csv") {
      downloadBlob(rowsToCSV(filasItems(agruparPorItems(lista)).map((f) => f.datos)), `${base}.csv`, "text/csv;charset=utf-8;");
    } else {
      downloadBlob(await libroExcel(lista, titulo), `${base}.xlsx`, XLSX_MIME);
    }
  };

  const correr = async (clave: string, fn: () => Promise<string | void>) => {
    setExportando(clave);
    setMsg(null);
    try {
      const ok = await fn();
      if (ok) setMsg({ ok });
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : "No se pudo exportar el reporte." });
    } finally {
      setExportando(null);
    }
  };

  const exportarGeneral = (fmt: "xlsx" | "csv") => correr(`gen|${fmt}`, async () => {
    if (!filtradas.length) throw new Error("No hay prefacturas con estos filtros.");
    await descargar(filtradas, fmt, `reporte_prefacturas_items${sufijo}`, "Reporte de prefacturas por ítems y ruta del pliego");
  });
  const exportarInterventor = (nombre: string, lista: PrefacturaRow[], fmt: "xlsx" | "csv") =>
    descargar(lista, fmt, `reporte_prefacturas_interventor_${slugify(nombre)}${sufijo}`, `Reporte de prefacturas — Interventor: ${nombre}`);
  const exportarTodos = (fmt: "xlsx" | "csv") => correr(`*|${fmt}`, async () => {
    for (const g of porInterventor) {
      await exportarInterventor(g.nombre, g.lista, fmt);
      await new Promise((r) => setTimeout(r, 400));
    }
    return `Se generaron ${porInterventor.length} reporte(s), uno por interventor.`;
  });

  const btnFmt = (fmt: "xlsx" | "csv") => (fmt === "xlsx" ? "Excel" : "CSV");
  const CeldaVista = ({ c, fuerte }: { c: Celda; fuerte?: boolean }) =>
    c.lineas === 0 ? <span className="muted">—</span> : (
      <div style={{ lineHeight: 1.3, fontWeight: fuerte ? 700 : undefined }}>
        <div className="num">{COP.format(c.valor)}</div>
        <div className="muted" style={{ fontSize: 12 }}>{cantidadTxt(c)}</div>
      </div>
    );

  return (
    <div style={{ marginBottom: 22 }}>
      <div className="table-wrap" style={{ padding: 18, display: "grid", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <label className="field">Fecha desde
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="field">Fecha hasta
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label className="field">Fechas según
            <select value={segun} onChange={(e) => setSegun(e.target.value as "periodo" | "generacion")}>
              <option value="periodo">Período del servicio</option>
              <option value="generacion">Fecha de la prefactura</option>
            </select>
          </label>
          <label className="field">Contrato
            <select value={contrato} onChange={(e) => setContrato(e.target.value)}>
              <option value="">Todos</option>
              {contratos.map((c) => <option key={c} value={c}>{contratoLabel(c)}</option>)}
            </select>
          </label>
          <label className="field">Área AAA solicitante
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Todas</option>
              {areasOpc.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="field">Interventor
            <select value={interventor} onChange={(e) => setInterventor(e.target.value)}>
              <option value="">Todos</option>
              {intervOpc.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
          <label className="field">Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="sin_rechazadas">Todas menos rechazadas</option>
              <option value="">Todas</option>
              {Object.entries(estados).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 13 }}>Rango rápido:</span>
          {([["mes", "Este mes"], ["anterior", "Mes anterior"], ["todo", "Todas las fechas"]] as const).map(([id, label]) => (
            <button key={id} className="btn btn-ghost btn-sm" onClick={() => { const [d, h] = rangoRapido(id); setDesde(d); setHasta(h); }}>{label}</button>
          ))}
          {desde && hasta && desde > hasta && <span style={{ color: "var(--high)", fontSize: 13 }}>La fecha desde es posterior a la fecha hasta.</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {filtradas.length} prefactura(s) · {COP.format(totalBase)} sin IVA · {COP.format(totalIva)} con IVA
          </span>
          <span style={{ flex: 1 }} />
          <div className="segmented">
            <button className={`seg${vista === "items" ? " active" : ""}`} onClick={() => setVista("items")}>Por ítems</button>
            <button className={`seg${vista === "interventor" ? " active" : ""}`} onClick={() => setVista("interventor")}>Por interventor</button>
          </div>
        </div>
        {msg && <div style={{ fontSize: 13, color: msg.ok ? "var(--ok)" : "var(--high)" }}>{msg.ok ?? msg.error}</div>}
      </div>

      {!filtradas.length ? (
        <div className="table-wrap" style={{ padding: 18 }}>
          <span className="muted">No hay prefacturas con estos filtros.</span>
        </div>
      ) : vista === "items" ? (
        <div className="table-wrap">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 18px" }}>
            <div>
              <b>Prefacturas por ítems y ruta del pliego</b>
              <div className="muted" style={{ fontSize: 12.5 }}>{alcanceTxt} · valores sin IVA</div>
            </div>
            <span style={{ flex: 1 }} />
            {(["xlsx", "csv"] as const).map((fmt) => (
              <button key={fmt} className="btn btn-ghost btn-sm" disabled={exportando !== null} onClick={() => void exportarGeneral(fmt)}>
                <IconDownload width={15} height={15} /> {exportando === `gen|${fmt}` ? "Generando…" : btnFmt(fmt)}
              </button>
            ))}
          </div>
          <table className="clean" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Ruta del pliego / zona</th>
                {CONDICIONES.map((c) => <th key={c.id} style={{ textAlign: "right" }}>{c.label}</th>)}
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {reporte.grupos.map((g) => (
                <Fragment key={g.key}>
                  <tr>
                    <td colSpan={CONDICIONES.length + 2} style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><b>{g.label}</b></td>
                  </tr>
                  {g.rutas.map((r) => (
                    <tr key={r.key}>
                      <td style={{ paddingLeft: 26 }}>{r.label}</td>
                      {CONDICIONES.map((c) => <td key={c.id} style={{ textAlign: "right" }}><CeldaVista c={r.celdas[c.id]} /></td>)}
                      <td style={{ textAlign: "right" }}><CeldaVista c={r.total} fuerte /></td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ paddingLeft: 26 }}><b>Subtotal del ítem</b></td>
                    {CONDICIONES.map((c) => <td key={c.id} style={{ textAlign: "right" }}><CeldaVista c={g.celdas[c.id]} fuerte /></td>)}
                    <td style={{ textAlign: "right" }}><CeldaVista c={g.total} fuerte /></td>
                  </tr>
                </Fragment>
              ))}
              <tr>
                <td><b>TOTAL</b></td>
                {CONDICIONES.map((c) => <td key={c.id} style={{ textAlign: "right" }}><CeldaVista c={reporte.total.celdas[c.id]} fuerte /></td>)}
                <td style={{ textAlign: "right" }}><CeldaVista c={reporte.total.total} fuerte /></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 18px" }}>
            <div>
              <b>Prefacturas por interventor</b>
              <div className="muted" style={{ fontSize: 12.5 }}>{alcanceTxt} · {porInterventor.length} interventor(es)</div>
            </div>
            <span style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 13 }}>Descargar uno por interventor:</span>
            {(["xlsx", "csv"] as const).map((fmt) => (
              <button key={fmt} className="btn btn-ghost btn-sm" disabled={exportando !== null} onClick={() => void exportarTodos(fmt)}>
                <IconDownload width={15} height={15} /> {exportando === `*|${fmt}` ? "Generando…" : btnFmt(fmt)}
              </button>
            ))}
          </div>
          <table className="clean" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Interventor</th>
                <th style={{ textAlign: "right" }}>Prefacturas</th>
                <th style={{ textAlign: "right" }}>Valor sin IVA</th>
                <th style={{ textAlign: "right" }}>Con IVA</th>
                <th style={{ textAlign: "right" }}>Descargar</th>
              </tr>
            </thead>
            <tbody>
              {porInterventor.map((g) => (
                <tr key={g.nombre}>
                  <td>{g.nombre}<span className="cc-dias">{g.lista.map((r) => r.numero).join(", ")}</span></td>
                  <td className="num" style={{ textAlign: "right" }}>{g.lista.length}</td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(g.base)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{COP.format(g.conIva)}</td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      {(["xlsx", "csv"] as const).map((fmt) => (
                        <button key={fmt} className="btn btn-ghost btn-sm" disabled={exportando !== null}
                          onClick={() => void correr(`${g.nombre}|${fmt}`, () => exportarInterventor(g.nombre, g.lista, fmt))}>
                          {exportando === `${g.nombre}|${fmt}` ? "Generando…" : btnFmt(fmt)}
                        </button>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
