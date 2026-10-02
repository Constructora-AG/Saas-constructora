"use client";
// ════════════════════════════════════════════════════════════════════
// Reporte por ítems — registros agrupados por ítem del tarifario y ruta
// del pliego, separados por condición de recargo (sin recargo / nocturno /
// dominical-festivo / ambos). Sirve para todos los contratos (Transporte,
// Alquiler, Emergencia y los creados en la app). Exporta a Excel y CSV.
// ════════════════════════════════════════════════════════════════════

import { Fragment, useMemo, useState } from "react";
import { IconDownload } from "../../icons";
import type { ViewProps } from "@/lib/transporte/useTransporte";
import { findCategoria, findRuta, fmtCOP, recargosCobrados } from "@/lib/transporte/logic";
import type { Servicio } from "@/lib/transporte/model";
import { num } from "@/lib/transporte/model";
import { downloadBlob, rowsToCSV } from "@/lib/transporte/export";

/** Condiciones de recargo en el orden en que se muestran. */
const CONDICIONES = [
  { id: "normal", label: "Sin recargo" },
  { id: "nocturno", label: "Nocturno" },
  { id: "dominical", label: "Dominical / festivo" },
  { id: "ambos", label: "Nocturno + dominical" },
] as const;
type CondId = (typeof CONDICIONES)[number]["id"];

interface Celda { registros: number; horas: number; valor: number }
const celdaVacia = (): Celda => ({ registros: 0, horas: 0, valor: 0 });
const sumar = (c: Celda, s: Servicio) => { c.registros += 1; c.horas += num(s.horasMaquina); c.valor += num(s.value); };

interface FilaRuta { id: string; label: string; celdas: Record<CondId, Celda>; total: Celda }
interface GrupoItem { id: string; label: string; rutas: FilaRuta[]; celdas: Record<CondId, Celda>; total: Celda }

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Rangos rápidos: [desde, hasta] en 'AAAA-MM-DD' ('' = sin límite). */
function rangoRapido(id: "mes" | "anterior" | "todo"): [string, string] {
  const hoy = new Date();
  if (id === "todo") return ["", ""];
  const m = id === "mes" ? hoy.getMonth() : hoy.getMonth() - 1;
  return [isoOf(new Date(hoy.getFullYear(), m, 1)), isoOf(new Date(hoy.getFullYear(), m + 1, 0))];
}

const nuevasCeldas = (): Record<CondId, Celda> =>
  ({ normal: celdaVacia(), nocturno: celdaVacia(), dominical: celdaVacia(), ambos: celdaVacia() });

export function ReporteItemsView({ t }: ViewProps) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [facturado, setFacturado] = useState(""); // '' | 'si' | 'no'
  const [exportando, setExportando] = useState<"csv" | "xlsx" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const conHoras = t.ficha.registros; // Alquiler / Emergencia / contratos de la app: registros por horas

  const servicios = useMemo(
    () => t.months.flatMap((mo) => t.servicesByMonth[mo.key] ?? []).filter((s) => {
      if (desde && s.date && s.date < desde) return false;
      if (hasta && s.date && s.date > hasta) return false;
      if (facturado === "si" && !s.invoiced) return false;
      if (facturado === "no" && s.invoiced) return false;
      return true;
    }),
    [t.months, t.servicesByMonth, desde, hasta, facturado],
  );

  const reporte = useMemo(() => {
    const tar = t.tarifario;
    // Transporte: el recargo se deduce del valor (datos migrados sin casilla); los demás, por las casillas.
    const condicion = (s: Servicio): CondId => {
      const r = t.ns === "transporte" && tar ? recargosCobrados(s, tar) : { nocturno: !!s.recargoNocturno, dominical: !!s.recargoDominical };
      return r.nocturno && r.dominical ? "ambos" : r.nocturno ? "nocturno" : r.dominical ? "dominical" : "normal";
    };
    const grupos = new Map<string, GrupoItem>();
    // Orden del tarifario: ítems y rutas tal como están en el pliego.
    tar?.categorias.forEach((c) => grupos.set(c.id, { id: c.id, label: c.label, rutas: [], celdas: nuevasCeldas(), total: celdaVacia() }));
    const total = { celdas: nuevasCeldas(), total: celdaVacia() };

    for (const s of servicios) {
      const cat = tar ? findCategoria(tar, s.tarifaCategoria) : null;
      const ruta = findRuta(cat, s.tarifaRuta);
      const itemId = cat?.id ?? (s.tarifaCategoria ? `?${s.tarifaCategoria}` : "manual");
      let g = grupos.get(itemId);
      if (!g) {
        g = { id: itemId, label: s.tarifaCategoria ? `Ítem ${s.tarifaCategoria} (ya no está en el tarifario)` : "Sin ítem (tarifa manual)", rutas: [], celdas: nuevasCeldas(), total: celdaVacia() };
        grupos.set(itemId, g);
      }
      const rutaId = ruta?.id ?? (s.tarifaRuta || "—");
      let f = g.rutas.find((r) => r.id === rutaId);
      if (!f) {
        f = { id: rutaId, label: ruta?.label ?? (s.tarifaRuta ? `Ruta ${s.tarifaRuta}` : "Sin ruta del pliego"), celdas: nuevasCeldas(), total: celdaVacia() };
        g.rutas.push(f);
      }
      const cond = condicion(s);
      [f.celdas[cond], f.total, g.celdas[cond], g.total, total.celdas[cond], total.total].forEach((c) => sumar(c, s));
    }
    const lista = [...grupos.values()].filter((g) => g.total.registros > 0);
    lista.forEach((g) => {
      const rutasPliego = (tar ? findCategoria(tar, g.id) : null)?.rutas ?? [];
      const pos = (rid: string) => { const i = rutasPliego.findIndex((r) => r.id === rid); return i < 0 ? 9999 : i; };
      g.rutas.sort((a, b) => pos(a.id) - pos(b.id) || a.label.localeCompare(b.label, "es"));
    });
    return { grupos: lista, total };
  }, [servicios, t.tarifario, t.ns]);

  const fmtHoras = (h: number) => `${h.toLocaleString("es-CO", { maximumFractionDigits: 1 })} h`;

  /** Filas planas para exportar: una por ítem × ruta, con subtotales por ítem y total general. */
  const filasExport = () => {
    const fila = (item: string, ruta: string, celdas: Record<CondId, Celda>, tot: Celda) => {
      const r: Record<string, string | number> = { "Ítem": item, "Ruta del pliego": ruta };
      CONDICIONES.forEach((c) => {
        r[`${c.label} · registros`] = celdas[c.id].registros;
        if (conHoras) r[`${c.label} · horas`] = celdas[c.id].horas;
        r[`${c.label} · valor`] = celdas[c.id].valor;
      });
      r["Total · registros"] = tot.registros;
      if (conHoras) r["Total · horas"] = tot.horas;
      r["Total · valor"] = tot.valor;
      return r;
    };
    const filas: Array<{ datos: Record<string, string | number>; tipo: "ruta" | "item" | "total" }> = [];
    reporte.grupos.forEach((g) => {
      g.rutas.forEach((r) => filas.push({ datos: fila(g.label, r.label, r.celdas, r.total), tipo: "ruta" }));
      filas.push({ datos: fila(`Subtotal ${g.label}`, "", g.celdas, g.total), tipo: "item" });
    });
    filas.push({ datos: fila("TOTAL", "", reporte.total.celdas, reporte.total.total), tipo: "total" });
    return filas;
  };

  const periodo = [desde || "inicio", hasta || "hoy"].join("_a_");
  const base = `reporte_items_${t.ficha.prefijoOrden.toLowerCase()}_${periodo}`;

  const exportar = async (fmt: "csv" | "xlsx") => {
    if (!reporte.grupos.length) { setMsg("No hay registros para exportar con estos filtros."); return; }
    setExportando(fmt);
    setMsg(null);
    try {
      const filas = filasExport();
      if (fmt === "csv") {
        downloadBlob(rowsToCSV(filas.map((f) => f.datos)), `${base}.csv`, "text/csv;charset=utf-8;");
        return;
      }
      const ExcelJSMod = await import("exceljs");
      const ExcelJS = (ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod;
      const wb = new ExcelJS.Workbook();
      wb.creator = t.ficha.nombre;
      const ws = wb.addWorksheet("Por ítems", { views: [{ state: "frozen", ySplit: 3, xSplit: 2 }] });
      const headers = Object.keys(filas[0].datos);
      ws.addRow([`${t.ficha.nombre} — ${t.ficha.numero} · Reporte por ítems y ruta del pliego`]).font = { bold: true, size: 13 };
      ws.addRow([`Periodo: ${desde || "inicio del contrato"} a ${hasta || "hoy"}${facturado === "si" ? " · solo facturados" : facturado === "no" ? " · solo pendientes" : ""}`]);
      const head = ws.addRow(headers);
      head.font = { bold: true, color: { argb: "FFFFFFFF" } };
      head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123A7A" } };
      head.alignment = { vertical: "middle", wrapText: true };
      head.height = 32;
      filas.forEach((f) => {
        const row = ws.addRow(headers.map((h) => f.datos[h]));
        if (f.tipo !== "ruta") {
          row.font = { bold: true };
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: f.tipo === "total" ? "FFD5E0F2" : "FFE8EEF7" } };
        }
      });
      headers.forEach((h, i) => {
        const col = ws.getColumn(i + 1);
        col.width = i === 0 ? 42 : i === 1 ? 32 : 14;
        if (h.endsWith("· valor")) col.numFmt = '"$"#,##0';
        if (h.endsWith("· horas")) col.numFmt = "#,##0.0";
      });
      const buf = await wb.xlsx.writeBuffer();
      const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      downloadBlob(new Blob([buf as BlobPart], { type: mime }), `${base}.xlsx`, mime);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo exportar el reporte.");
    } finally {
      setExportando(null);
    }
  };

  const CeldaVista = ({ c, fuerte }: { c: Celda; fuerte?: boolean }) =>
    c.registros === 0 ? <span className="muted">—</span> : (
      <div style={{ lineHeight: 1.3, fontWeight: fuerte ? 700 : undefined }}>
        <div className="num">{fmtCOP(c.valor)}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          {c.registros} reg.{conHoras && c.horas > 0 ? ` · ${fmtHoras(c.horas)}` : ""}
        </div>
      </div>
    );

  return (
    <>
      <div className="section-title">Reporte por ítems y ruta del pliego</div>
      <div className="table-wrap" style={{ padding: 18, display: "grid", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <label className="field">Fecha desde
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="field">Fecha hasta
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label className="field">Estado de facturación
            <select value={facturado} onChange={(e) => setFacturado(e.target.value)}>
              <option value="">Todos</option>
              <option value="si">Facturado</option>
              <option value="no">Pendiente</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 13 }}>Rango rápido:</span>
          {([["mes", "Este mes"], ["anterior", "Mes anterior"], ["todo", "Toda la vigencia"]] as const).map(([id, label]) => (
            <button key={id} className="btn btn-ghost btn-sm" onClick={() => { const [d, h] = rangoRapido(id); setDesde(d); setHasta(h); }}>
              {label}
            </button>
          ))}
          {desde && hasta && desde > hasta && <span style={{ color: "var(--high)", fontSize: 13 }}>La fecha desde es posterior a la fecha hasta.</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {reporte.total.total.registros} registro(s) · {fmtCOP(reporte.total.total.valor)}
            {conHoras && reporte.total.total.horas > 0 ? ` · ${fmtHoras(reporte.total.total.horas)}` : ""}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" disabled={exportando !== null} onClick={() => void exportar("xlsx")}>
            <IconDownload width={15} height={15} /> {exportando === "xlsx" ? "Generando…" : "Excel"}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={exportando !== null} onClick={() => void exportar("csv")}>
            <IconDownload width={15} height={15} /> {exportando === "csv" ? "Generando…" : "CSV"}
          </button>
          {msg && <span style={{ color: "var(--high)", fontSize: 13 }}>{msg}</span>}
        </div>
      </div>

      {!reporte.grupos.length ? (
        <div className="table-wrap" style={{ padding: 18, marginBottom: 18 }}>
          <span className="muted">No hay registros en el periodo seleccionado.</span>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 24 }}>
          <table className="clean">
            <thead>
              <tr>
                <th>Ruta del pliego</th>
                {CONDICIONES.map((c) => <th key={c.id} className="num">{c.label}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {reporte.grupos.map((g) => (
                <Fragment key={g.id}>
                  <tr>
                    <td colSpan={CONDICIONES.length + 2} style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><b>{g.label}</b></td>
                  </tr>
                  {g.rutas.map((r) => (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: 22 }}>{r.label}</td>
                      {CONDICIONES.map((c) => <td key={c.id} className="num"><CeldaVista c={r.celdas[c.id]} /></td>)}
                      <td className="num"><CeldaVista c={r.total} fuerte /></td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ paddingLeft: 22 }}><b>Subtotal del ítem</b></td>
                    {CONDICIONES.map((c) => <td key={c.id} className="num"><CeldaVista c={g.celdas[c.id]} fuerte /></td>)}
                    <td className="num"><CeldaVista c={g.total} fuerte /></td>
                  </tr>
                </Fragment>
              ))}
              <tr style={{ borderTop: "2px solid var(--border)" }}>
                <td><b>TOTAL</b></td>
                {CONDICIONES.map((c) => <td key={c.id} className="num"><CeldaVista c={reporte.total.celdas[c.id]} fuerte /></td>)}
                <td className="num"><CeldaVista c={reporte.total.total} fuerte /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
