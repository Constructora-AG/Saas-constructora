"use client";
// ════════════════════════════════════════════════════════════════════
// Prefacturas (Proyecto Triple A)
// - N° automático consecutivo PF0001, PF0002, … (lo asigna el servidor).
// - Estado: "Pendiente de Acta y Migo" por defecto → al cargar ambos
//   documentos pasa solo a "Pendiente de pago" → "Pagada" | "Rechazada".
// - Crear, editar (mismo formulario), eliminar; cargar/abrir acta y migo.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from "react";
import { catalogoDe, type AdjuntoPrefactura, type PrefacturaItem, type PrefacturaRow } from "@/lib/aaa/catalogo";
import { CORTE } from "@/lib/aaa/compute";
import { IconAlert, IconCheck, IconChart, IconCoins } from "../icons";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const ESTADOS: Record<string, { label: string; cls: string }> = {
  pendiente_acta_migo: { label: "Pendiente de Acta y Migo", cls: "warn" },
  pendiente_pago: { label: "Pendiente de pago", cls: "mid" },
  pagada: { label: "Pagada", cls: "ok" },
  rechazada: { label: "Rechazada", cls: "high" },
};
const ACTIVAS = new Set(["pendiente_acta_migo", "pendiente_pago"]);

const HOY = new Date();
function diasDesde(fecha: string) {
  return Math.max(0, Math.floor((HOY.getTime() - new Date(fecha + "T00:00:00").getTime()) / 86400000));
}
function agingCls(dias: number) {
  return dias > 30 ? "high" : dias > 15 ? "warn" : "ok";
}
function fmtF(s: string | null | undefined) {
  return s ? new Date(s + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}
function abrirAdjunto(a: AdjuntoPrefactura) {
  const [head, b64] = a.dataUrl.split(",");
  const mime = /data:(.*?);/.exec(head)?.[1] ?? a.type ?? "application/octet-stream";
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function leerArchivo(f: File): Promise<AdjuntoPrefactura> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, type: f.type || "application/octet-stream", dataUrl: String(r.result) });
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(f);
  });
}

interface ItemForm { item: string; cantidad: string; vr_unit: string }
const ITEM0: ItemForm = { item: "", cantidad: "", vr_unit: "" };
const FORM0 = { contrato: "alquiler" as "alquiler" | "emergencia", fecha_generacion: "", fecha_vencimiento: "", centro_costo: "", periodo: "", lugar: "", nota: "" };

export function PrefacturasClient({ initialRows, demo }: { initialRows: PrefacturaRow[]; demo: boolean }) {
  const [rows, setRows] = useState<PrefacturaRow[]>(initialRows);
  // N° consecutivo automático (informativo; el servidor asigna el definitivo)
  const proximoNumero = `PF${String(Math.max(0, ...rows.map((r) => parseInt(String(r.numero ?? "").replace(/\D/g, ""), 10) || 0)) + 1).padStart(4, "0")} (automático)`;
  const [form, setForm] = useState(FORM0);
  const [items, setItems] = useState<ItemForm[]>([{ ...ITEM0 }]);
  const [editando, setEditando] = useState<PrefacturaRow | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendienteSubida = useRef<{ id: string; campo: "acta" | "migo" } | null>(null);

  const catalogo = catalogoDe(form.contrato);
  const activas = useMemo(() => rows.filter((r) => ACTIVAS.has(r.estado)), [rows]);
  const totalActivo = activas.reduce((s, r) => s + Number(r.valor_base), 0);
  const totalPendientePago = activas.filter((r) => r.estado === "pendiente_pago").reduce((s, r) => s + Number(r.valor_base), 0);
  const masAntigua = activas.reduce((m, r) => Math.max(m, diasDesde(r.fecha_generacion)), 0);
  const totalForm = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.vr_unit) || 0), 0);

  const setF = (k: keyof typeof FORM0) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  function setItem(i: number, patch: Partial<ItemForm>) {
    setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }
  function elegirItem(i: number, nombre: string) {
    const cat = catalogo.find((c) => c.item === nombre);
    setItem(i, { item: nombre, vr_unit: cat ? String(cat.tarifa) : "" });
  }

  const cerrarForm = () => { setMostrarForm(false); setEditando(null); setForm(FORM0); setItems([{ ...ITEM0 }]); };
  useEffect(() => {
    if (!mostrarForm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarForm(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarForm]);
  const abrirNuevo = () => { setError(null); setOk(null); setEditando(null); setForm(FORM0); setItems([{ ...ITEM0 }]); setMostrarForm(true); };
  const abrirEdicion = (r: PrefacturaRow) => {
    setError(null); setOk(null);
    setEditando(r);
    setForm({ contrato: r.contrato, fecha_generacion: r.fecha_generacion ?? "", fecha_vencimiento: r.fecha_vencimiento ?? "", centro_costo: r.centro_costo ?? "", periodo: r.periodo ?? "", lugar: r.lugar ?? "", nota: r.nota ?? "" });
    setItems((r.items as PrefacturaItem[]).map((it) => ({ item: it.item, cantidad: String(it.cantidad), vr_unit: String(it.vr_unit) })));
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function llamar(init: RequestInit): Promise<PrefacturaRow | null> {
    const res = await fetch("/api/aaa/prefacturas", { headers: { "Content-Type": "application/json" }, ...init });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "La operación falló");
    return (body.prefactura as PrefacturaRow) ?? null;
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(null);
    if (demo) { setError("Modo demostración: conecta Supabase para registrar prefacturas reales."); return; }
    setSaving(true);
    try {
      const payload = {
        contrato: form.contrato,
        fecha_generacion: form.fecha_generacion,
        fecha_vencimiento: form.fecha_vencimiento || null,
        centro_costo: form.centro_costo.trim() || null,
        periodo: form.periodo.trim() || null,
        lugar: form.lugar.trim() || null,
        nota: form.nota.trim() || null,
        items: items.filter((it) => it.item).map((it) => ({ item: it.item, cantidad: Number(it.cantidad), vr_unit: Number(it.vr_unit) })),
      };
      if (editando) {
        const p = await llamar({ method: "PATCH", body: JSON.stringify({ id: editando.id, ...payload }) });
        if (p) setRows((rs) => rs.map((r) => (r.id === p.id ? p : r)));
        setOk(`Prefactura ${editando.numero} actualizada.`);
      } else {
        const p = await llamar({ method: "POST", body: JSON.stringify(payload) });
        if (p) setRows((r) => [p, ...r]);
        setOk(`Prefactura ${p?.numero ?? ""} registrada (Pendiente de Acta y Migo).`);
      }
      cerrarForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function cambiarEstado(row: PrefacturaRow, estado: string) {
    if (demo) { setError("Modo demostración: conecta Supabase para actualizar."); return; }
    setError(null); setOk(null);
    const patch: Record<string, unknown> = { id: row.id, estado };
    if (estado === "pagada" && !row.numero_factura) {
      const num = window.prompt("Número de factura / soporte de pago (opcional):");
      if (num) { patch.numero_factura = num; patch.fecha_factura = new Date().toISOString().slice(0, 10); }
    }
    try {
      const p = await llamar({ method: "PATCH", body: JSON.stringify(patch) });
      if (p) setRows((rs) => rs.map((r) => (r.id === row.id ? p : r)));
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function eliminar(row: PrefacturaRow) {
    if (demo) { setError("Modo demostración: conecta Supabase para eliminar."); return; }
    if (!window.confirm(`¿Eliminar la prefactura ${row.numero}? Esta acción no se puede deshacer.`)) return;
    setError(null); setOk(null);
    try {
      await llamar({ method: "DELETE", body: JSON.stringify({ id: row.id }) });
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      if (editando?.id === row.id) cerrarForm();
      setOk(`Prefactura ${row.numero} eliminada.`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  // Carga de acta / migo: abre el selector de archivo y envía el documento
  const pedirArchivo = (id: string, campo: "acta" | "migo") => {
    pendienteSubida.current = { id, campo };
    fileRef.current?.click();
  };
  async function archivoElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    const destino = pendienteSubida.current;
    e.target.value = "";
    if (!f || !destino) return;
    if (f.size > 4 * 1024 * 1024) { setError("El archivo supera 4 MB. Comprímelo o usa un PDF más liviano."); return; }
    setError(null); setOk(null);
    setSubiendo(`${destino.id}:${destino.campo}`);
    try {
      const adj = await leerArchivo(f);
      const p = await llamar({ method: "PATCH", body: JSON.stringify({ id: destino.id, [destino.campo]: adj }) });
      if (p) {
        setRows((rs) => rs.map((r) => (r.id === p.id ? p : r)));
        setOk(p.estado === "pendiente_pago" && p.acta && p.migo ? `${destino.campo === "acta" ? "Acta" : "Migo"} cargado. La prefactura ${p.numero} pasó a Pendiente de pago.` : `${destino.campo === "acta" ? "Acta" : "Migo"} cargado en ${p.numero}.`);
      }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setSubiendo(null); pendienteSubida.current = null; }
  }
  async function quitarAdjunto(row: PrefacturaRow, campo: "acta" | "migo") {
    if (!window.confirm(`¿Quitar el ${campo === "acta" ? "acta" : "migo"} de ${row.numero}?`)) return;
    try {
      const p = await llamar({ method: "PATCH", body: JSON.stringify({ id: row.id, [campo]: null }) });
      if (p) setRows((rs) => rs.map((r) => (r.id === row.id ? p : r)));
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  const Adjunto = ({ r, campo }: { r: PrefacturaRow; campo: "acta" | "migo" }) => {
    const a = r[campo];
    const label = campo === "acta" ? "Acta" : "Migo";
    const busy = subiendo === `${r.id}:${campo}`;
    return a ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <button className="badge ok" style={{ border: "none", cursor: "pointer", font: "inherit" }} title={`Abrir ${a.name}`} onClick={() => abrirAdjunto(a)}>✓ {label}</button>
        {ACTIVAS.has(r.estado) && <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px" }} title={`Quitar ${label.toLowerCase()}`} onClick={() => void quitarAdjunto(r, campo)}>×</button>}
      </span>
    ) : (
      <button className="btn btn-ghost btn-sm" disabled={busy || demo || !ACTIVAS.has(r.estado)} onClick={() => pedirArchivo(r.id, campo)} title={`Cargar ${label.toLowerCase()} (PDF o imagen)`}>
        {busy ? "Subiendo…" : `Cargar ${label}`}
      </button>
    );
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => void archivoElegido(e)} />

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-ico s-warn"><IconAlert /></span><span className="kpi-label">En prefactura (activo, sin IVA)</span></div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(totalActivo)}</div>
          <div className="kpi-foot">{activas.length} prefactura{activas.length === 1 ? "" : "s"} pendiente{activas.length === 1 ? "" : "s"} de acta/migo o de pago</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-ico"><IconChart /></span><span className="kpi-label">Con IVA (19%)</span></div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(totalActivo * (1 + CORTE.iva_pct))}</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-ico s-ok"><IconCheck /></span><span className="kpi-label">Pendiente de pago</span></div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(totalPendientePago)}</div>
          <div className="kpi-foot">con acta y migo cargados</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className={`kpi-ico ${masAntigua > 30 ? "s-high" : masAntigua > 15 ? "s-warn" : ""}`}><IconCoins /></span><span className="kpi-label">Más antigua sin pagar</span></div>
          <div className="kpi-value">{masAntigua} días</div>
          <div className="kpi-foot">capital de trabajo pendiente de cobro</div>
        </div>
      </div>

      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>Registro de prefacturas</span>
        <span className="topbar-spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={abrirNuevo}>+ Registrar prefactura</button>
      </div>

      {ok && (
        <div className="info-bar" style={{ marginBottom: 12 }}>
          <div>{ok}</div>
          <span className="topbar-spacer" style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setOk(null)}>Cerrar</button>
        </div>
      )}

      {mostrarForm && (
        <>
          <div className="drawer-overlay" onClick={cerrarForm} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={editando ? `Editar prefactura ${editando.numero}` : "Nueva prefactura"}>
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="drawer-title">{editando ? `Editar prefactura ${editando.numero}` : "Nueva prefactura"}</h2>
                <span className="cc-dias">{editando ? `Estado: ${(ESTADOS[editando.estado] ?? { label: editando.estado }).label}` : `N° ${proximoNumero.replace(" (automático)", "")} · se asigna automáticamente`}</span>
              </div>
              <button className="drawer-close" onClick={cerrarForm} title="Cerrar (Esc)">×</button>
            </div>
            <div className="drawer-body">
        <form onSubmit={guardar} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <input className="input" readOnly value={editando ? editando.numero : proximoNumero} title="Se asigna automáticamente de forma consecutiva" style={{ background: "var(--surface-2)", color: "var(--text-2)" }} />
            <select className="input" value={form.contrato} onChange={(e) => { setForm((f) => ({ ...f, contrato: e.target.value as typeof form.contrato })); setItems([{ ...ITEM0 }]); }}>
              <option value="alquiler">Contrato Alquiler</option>
              <option value="emergencia">Otro Sí / Emergencia</option>
            </select>
            <label className="field">Generación *<input className="input" required type="date" value={form.fecha_generacion} onChange={setF("fecha_generacion")} /></label>
            <label className="field">Vencimiento<input className="input" type="date" value={form.fecha_vencimiento} onChange={setF("fecha_vencimiento")} /></label>
            <input className="input" placeholder="Centro de costo AAA (ej. MANTENIMIENTO, ASEO)" value={form.centro_costo} onChange={setF("centro_costo")} />
            <input className="input" placeholder="Período (ej. 21 al 25 de julio)" value={form.periodo} onChange={setF("periodo")} />
            <input className="input" placeholder="Lugar del servicio" value={form.lugar} onChange={setF("lugar")} />
            <input className="input" placeholder="Nota / observaciones" value={form.nota} onChange={setF("nota")} />
          </div>

          <div className="section-title" style={{ margin: "4px 0 0" }}>Ítems — nombres exactos de Herpro (así cruzan al facturar)</div>
          {items.map((it, i) => {
            const cat = catalogo.find((c) => c.item === it.item);
            const valor = (Number(it.cantidad) || 0) * (Number(it.vr_unit) || 0);
            return (
              <div key={i} style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr 34px", alignItems: "center", padding: "8px 10px", background: "var(--surface-2)", borderRadius: 8 }}>
                <select className="input" required value={it.item} onChange={(e) => elegirItem(i, e.target.value)} style={{ gridColumn: "1 / -1" }}>
                  <option value="">Ítem Herpro *</option>
                  {catalogo.map((c) => (
                    <option key={c.item} value={c.item}>{c.maquina} — {c.item}</option>
                  ))}
                </select>
                <input className="input" required type="number" min="0.01" step="0.01" placeholder={`Cant. ${cat?.unidad ?? ""}`} value={it.cantidad} onChange={(e) => setItem(i, { cantidad: e.target.value })} />
                <input className="input" required type="number" min="1" step="0.01" placeholder="Tarifa sin IVA" value={it.vr_unit} onChange={(e) => setItem(i, { vr_unit: e.target.value })} />
                <div className="num muted" style={{ textAlign: "right" }}>{valor > 0 ? COP.format(valor) : "—"}</div>
                <button type="button" className="btn btn-ghost btn-sm" title="Quitar ítem" disabled={items.length === 1} onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))}>×</button>
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems((arr) => [...arr, { ...ITEM0 }])}>+ Agregar ítem</button>
            <span className="topbar-spacer" style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 13 }}>
              Subtotal <b className="num">{COP.format(totalForm)}</b> · IVA <b className="num">{COP.format(totalForm * CORTE.iva_pct)}</b> · Total <b className="num">{COP.format(totalForm * (1 + CORTE.iva_pct))}</b>
            </span>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Guardando…" : editando ? "Guardar cambios" : "Guardar prefactura"}</button>
          </div>
          {error && <div style={{ color: "var(--high)", fontSize: 13 }}>{error}</div>}
        </form>
            </div>
          </aside>
        </>
      )}
      {!mostrarForm && error && <div style={{ color: "var(--high)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div className="table-wrap">
        <table className="clean" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>N°</th>
              <th>Contrato</th>
              <th>Período / lugar</th>
              <th style={{ textAlign: "right" }}>Valor sin IVA</th>
              <th style={{ textAlign: "right" }}>Con IVA</th>
              <th>Antigüedad</th>
              <th>Estado</th>
              <th>Acta / Migo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ padding: 18 }}>Sin prefacturas registradas.</td></tr>
            )}
            {rows.map((r) => {
              const est = ESTADOS[r.estado] ?? { label: r.estado, cls: "warn" };
              const activa = ACTIVAS.has(r.estado);
              const dias = diasDesde(r.fecha_generacion);
              const open = abierta === r.id;
              return (
                <Row key={r.id}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setAbierta(open ? null : r.id)}>
                    <td><b>{r.numero}</b><span className="cc-dias">{fmtF(r.fecha_generacion)}</span></td>
                    <td className="muted">{r.contrato === "alquiler" ? "Alquiler" : "Emergencia"}{r.centro_costo ? <span className="cc-dias">{r.centro_costo}</span> : null}</td>
                    <td className="muted">{r.periodo ?? "—"}{r.lugar ? ` · ${r.lugar}` : ""}{r.fecha_vencimiento ? <span className="cc-dias">vence {fmtF(r.fecha_vencimiento)}</span> : null}</td>
                    <td className="num" style={{ textAlign: "right" }}><b>{COP.format(Number(r.valor_base))}</b></td>
                    <td className="num muted" style={{ textAlign: "right" }}>{COP.format(Number(r.valor_base) * (1 + CORTE.iva_pct))}</td>
                    <td>{activa ? <span className={`badge ${agingCls(dias)}`}>{dias} días</span> : <span className="muted">—</span>}</td>
                    <td>
                      <span className={`badge ${est.cls}`}>{est.label}</span>
                      {r.numero_factura && <span className="cc-dias">{r.numero_factura} · {fmtF(r.fecha_factura)}</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <Adjunto r={r} campo="acta" />
                        <Adjunto r={r} campo="migo" />
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        {r.estado === "pendiente_pago" && (
                          <button className="btn btn-primary btn-sm" onClick={() => void cambiarEstado(r, "pagada")}>Marcar pagada</button>
                        )}
                        {activa && (
                          <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }} onClick={() => void cambiarEstado(r, "rechazada")}>Rechazar</button>
                        )}
                        {(r.estado === "rechazada" || r.estado === "pagada") && (
                          <button className="btn btn-ghost btn-sm" onClick={() => void cambiarEstado(r, r.acta && r.migo ? "pendiente_pago" : "pendiente_acta_migo")}>Reabrir</button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => abrirEdicion(r)}>Editar</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }} onClick={() => void eliminar(r)}>Eliminar</button>
                      </span>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={9} style={{ background: "var(--surface-2)", padding: "8px 18px 14px" }}>
                        <table className="clean" style={{ fontSize: 12.5 }}>
                          <thead>
                            <tr><th>Ítem Herpro</th><th>Máquina</th><th style={{ textAlign: "right" }}>Cantidad</th><th>Unidad</th><th style={{ textAlign: "right" }}>Tarifa</th><th style={{ textAlign: "right" }}>Valor sin IVA</th></tr>
                          </thead>
                          <tbody>
                            {(r.items as PrefacturaItem[]).map((it, i) => (
                              <tr key={i}>
                                <td><b>{it.item}</b></td>
                                <td className="muted">{it.maquina}</td>
                                <td className="num" style={{ textAlign: "right" }}>{it.cantidad}</td>
                                <td className="muted">{it.unidad}</td>
                                <td className="num" style={{ textAlign: "right" }}>{COP.format(it.vr_unit)}</td>
                                <td className="num" style={{ textAlign: "right" }}>{COP.format(it.valor_base)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {r.nota && <div className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>Nota: {r.nota}</div>}
                      </td>
                    </tr>
                  )}
                </Row>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Fragment con key para agrupar la fila principal y su detalle expandible.
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
