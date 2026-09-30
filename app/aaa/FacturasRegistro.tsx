"use client";
// ════════════════════════════════════════════════════════════════════
// Registros del contrato (facturas N° AGF … emitidas a Triple A):
// Otro Sí / Emergencia o Contrato de Alquiler. Tabla con buscador, filtro
// por mes y totales; agregar / editar en drawer, eliminar y exportar a Excel.
// Datos en aaa_facturas vía /api/aaa/facturas.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { IconDownload } from "../icons";

export interface FacturaRow {
  id: string;
  contrato: "alquiler" | "emergencia";
  numero: string;
  fecha: string;
  concepto: string;
  valor_total: number;
  nota: string | null;
}

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fFecha = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const mesDe = (iso: string) => iso.slice(0, 7);
const mesLabel = (k: string) => `${MESES[Number(k.slice(5, 7)) - 1] ?? k} ${k.slice(0, 4)}`;
/** Valor digitado: acepta 16263151.66, 16.263.151,66, 16,263,151.66 y $ 16.263.151. */
export function parseValor(txt: string): number {
  let t = String(txt).replace(/[^\d.,-]/g, "");
  const ultComa = t.lastIndexOf(","), ultPunto = t.lastIndexOf(".");
  if (ultComa > ultPunto) t = t.replace(/\./g, "").replace(",", "."); // 16.263.151,66
  else if (ultComa >= 0) t = t.replace(/,/g, "");                       // 16,263,151.66
  else if ((t.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, ""); // 16.263.151
  return Number(t);
}
const FORM0 = { numero: "", fecha: "", concepto: "", valor_total: "", nota: "" };

/** Registros (facturas AGF …) de un contrato desde /api/aaa/facturas. Lo usan esta tabla y el Resumen del Contrato de Alquiler. */
export function useRegistrosContrato(contrato: "alquiler" | "emergencia" | null) {
  const [rows, setRows] = useState<FacturaRow[]>([]);
  const [cargando, setCargando] = useState(contrato !== null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!contrato) return; // sin contrato (p. ej. Transporte AAA): no hay registros que cargar
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/aaa/facturas?contrato=${contrato}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "No se pudieron cargar los registros.");
        if (vivo) { setRows(j.facturas ?? []); setDemo(!!j.demo); }
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [contrato]);
  return { rows, setRows, cargando, demo, error };
}

export function FacturasRegistro({ contrato, titulo, conceptos = [] }: { contrato: "alquiler" | "emergencia"; titulo: string; conceptos?: string[] }) {
  const { rows, setRows, cargando, demo, error: errorCarga } = useRegistrosContrato(contrato);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (errorCarga) setError(errorCarga); }, [errorCarga]);
  const [ok, setOk] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [mes, setMes] = useState("");
  const [form, setForm] = useState(FORM0);
  const [editando, setEditando] = useState<FacturaRow | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const ordenadas = useMemo(() => [...rows].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, "es", { numeric: true })), [rows]);
  const meses = useMemo(() => [...new Set(ordenadas.map((r) => mesDe(r.fecha)))].sort(), [ordenadas]);
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return ordenadas.filter((r) => (!mes || mesDe(r.fecha) === mes) && (!q || `${r.numero} ${r.concepto} ${r.nota ?? ""}`.toLowerCase().includes(q)));
  }, [ordenadas, buscar, mes]);
  const total = visibles.reduce((s, r) => s + Number(r.valor_total), 0);
  const totalGeneral = rows.reduce((s, r) => s + Number(r.valor_total), 0);
  const sugerencias = useMemo(() => [...new Set([...conceptos, ...rows.map((r) => r.concepto)])].sort(), [conceptos, rows]);

  const cerrarForm = () => { setMostrarForm(false); setEditando(null); setForm(FORM0); };
  useEffect(() => {
    if (!mostrarForm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarForm(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mostrarForm]);

  const nueva = () => { setError(null); setOk(null); setEditando(null); setForm({ ...FORM0, fecha: new Date().toISOString().slice(0, 10) }); setMostrarForm(true); };
  const editar = (r: FacturaRow) => { setError(null); setOk(null); setEditando(r); setForm({ numero: r.numero, fecha: r.fecha, concepto: r.concepto, valor_total: String(r.valor_total), nota: r.nota ?? "" }); setMostrarForm(true); };

  async function llamar(init: RequestInit): Promise<FacturaRow | null> {
    const res = await fetch("/api/aaa/facturas", { headers: { "Content-Type": "application/json" }, ...init });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "La operación falló");
    return (j.factura as FacturaRow) ?? null;
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(null);
    if (demo) { setError("Modo demostración: conecta Supabase para guardar registros."); return; }
    setSaving(true);
    try {
      const body = { contrato, numero: form.numero, fecha: form.fecha, concepto: form.concepto, valor_total: parseValor(form.valor_total), nota: form.nota };
      const f = editando
        ? await llamar({ method: "PATCH", body: JSON.stringify({ id: editando.id, ...body }) })
        : await llamar({ method: "POST", body: JSON.stringify(body) });
      if (f) setRows((rs) => (editando ? rs.map((r) => (r.id === f.id ? f : r)) : [...rs, f]));
      setOk(editando ? `Registro ${f?.numero} actualizado.` : `Registro ${f?.numero} agregado.`);
      cerrarForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(r: FacturaRow) {
    if (demo) { setError("Modo demostración: conecta Supabase para eliminar."); return; }
    if (!window.confirm(`¿Eliminar el registro ${r.numero}? Esta acción no se puede deshacer.`)) return;
    setError(null); setOk(null);
    try {
      await llamar({ method: "DELETE", body: JSON.stringify({ id: r.id }) });
      setRows((rs) => rs.filter((x) => x.id !== r.id));
      if (editando?.id === r.id) cerrarForm();
      setOk(`Registro ${r.numero} eliminado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function exportar() {
    const XLSX = await import("xlsx");
    const datos = visibles.map((r, i) => ({ "N°": i + 1, "N° Factura": r.numero, Fecha: fFecha(r.fecha), Concepto: r.concepto, "Valor Total": Number(r.valor_total), Nota: r.nota ?? "" }));
    datos.push({ "N°": "" as unknown as number, "N° Factura": "", Fecha: "", Concepto: "TOTAL", "Valor Total": total, Nota: `${visibles.length} registro(s)` });
    const ws = XLSX.utils.json_to_sheet(datos);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 12 }, { wch: 70 }, { wch: 18 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, contrato === "emergencia" ? "EMERGENCIA" : "ALQUILER");
    XLSX.writeFile(wb, `Registros_${contrato === "emergencia" ? "EMERGENCIA" : "ALQUILER"}${mes ? `_${mes}` : ""}.xlsx`);
  }

  const setF = (k: keyof typeof FORM0) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-label">Registros</span></div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{rows.length}</div>
          {rows.length > 0 && <div className="kpi-foot">{fFecha(ordenadas[0].fecha)} — {fFecha(ordenadas[ordenadas.length - 1].fecha)}</div>}
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-label">Valor ejecutado</span></div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(totalGeneral)}</div>
          <div className="kpi-foot">suma del valor total de los registros</div>
        </div>
        {(mes || buscar) && (
          <div className="kpi">
            <div className="kpi-head"><span className="kpi-label">Total del filtro</span></div>
            <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(total)}</div>
            <div className="kpi-foot">{visibles.length} registro(s)</div>
          </div>
        )}
      </div>

      <div className="filters-bar">
        <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar N° o concepto…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <select className="input" style={{ maxWidth: 190 }} value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => void exportar()} disabled={!visibles.length}><IconDownload /> Excel</button>
        <button className="btn btn-primary btn-sm" onClick={nueva}>+ Nuevo registro</button>
      </div>

      {demo && <div className="info-bar" style={{ marginBottom: 12 }}>Modo demostración: se muestran los registros iniciales y los cambios no se guardan.</div>}
      {!mostrarForm && error && <div style={{ color: "var(--high)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {ok && <div style={{ color: "var(--ok)", fontSize: 13, marginBottom: 12 }}>{ok}</div>}

      <div className="table-wrap table-scroll">
        <table className="clean" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ width: 44 }}>N°</th>
              <th>N° Factura</th>
              <th>Fecha</th>
              <th>Concepto</th>
              <th style={{ textAlign: "right" }}>Valor total</th>
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={6} className="muted">Cargando registros…</td></tr>}
            {!cargando && !visibles.length && <tr><td colSpan={6} className="muted">{rows.length ? "Ningún registro coincide con el filtro." : `Aún no hay registros de ${titulo}.`}</td></tr>}
            {visibles.map((r, i) => (
              <tr key={r.id}>
                <td className="muted">{i + 1}</td>
                <td><b>{r.numero}</b></td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fFecha(r.fecha)}</td>
                <td>{r.concepto}{r.nota && <span className="cc-dias">{r.nota}</span>}</td>
                <td className="num" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{COP.format(Number(r.valor_total))}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => editar(r)}>Editar</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }} onClick={() => void eliminar(r)} title="Eliminar">×</button>
                </td>
              </tr>
            ))}
          </tbody>
          {visibles.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: "right" }}><b>Total ({visibles.length} registro{visibles.length === 1 ? "" : "s"})</b></td>
                <td className="num" style={{ textAlign: "right", whiteSpace: "nowrap" }}><b>{COP.format(total)}</b></td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {mostrarForm && (
        <>
          <div className="drawer-overlay" onClick={cerrarForm} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={editando ? `Editar registro ${editando.numero}` : "Nuevo registro"}>
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="drawer-title">{editando ? `Editar registro ${editando.numero}` : "Nuevo registro"}</h2>
                <span className="cc-dias">{titulo}</span>
              </div>
              <button className="drawer-close" onClick={cerrarForm} title="Cerrar (Esc)">×</button>
            </div>
            <div className="drawer-body">
              <form onSubmit={guardar} style={{ display: "grid", gap: 12 }}>
                <label className="field">N° Factura<input className="input" required placeholder="Ej. AGF 680" value={form.numero} onChange={setF("numero")} /></label>
                <label className="field">Fecha<input className="input" type="date" required value={form.fecha} onChange={setF("fecha")} /></label>
                <label className="field">Concepto
                  <input className="input" required list={`conceptos-${contrato}`} placeholder="Ej. Transporte de Residuos Especiales" value={form.concepto} onChange={setF("concepto")} />
                  <datalist id={`conceptos-${contrato}`}>{sugerencias.map((c) => <option key={c} value={c} />)}</datalist>
                </label>
                <label className="field">Valor total (con IVA)<input className="input" required inputMode="decimal" placeholder="Ej. 16263151.66" value={form.valor_total} onChange={setF("valor_total")} /></label>
                <label className="field">Nota (opcional)<textarea className="input" rows={3} value={form.nota} onChange={setF("nota")} /></label>
                {error && <div style={{ color: "var(--high)", fontSize: 13 }}>{error}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Guardando…" : editando ? "Guardar cambios" : "Agregar registro"}</button>
                  <button className="btn btn-ghost" type="button" onClick={cerrarForm}>Cancelar</button>
                </div>
              </form>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
