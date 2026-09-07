"use client";
import { useMemo, useState } from "react";
import { catalogoDe, type PrefacturaItem, type PrefacturaRow } from "@/lib/aaa/catalogo";
import { CORTE } from "@/lib/aaa/compute";
import { IconAlert, IconCheck, IconChart, IconCoins } from "../icons";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const ESTADOS: Record<string, { label: string; cls: string }> = {
  en_conciliacion: { label: "En conciliación", cls: "warn" },
  con_orden: { label: "Con orden de facturación", cls: "mid" },
  facturada: { label: "Facturada", cls: "ok" },
  pagada: { label: "Pagada", cls: "ok" },
  rechazada: { label: "Rechazada", cls: "high" },
};

const HOY = new Date();

function diasDesde(fecha: string) {
  return Math.max(0, Math.floor((HOY.getTime() - new Date(fecha + "T00:00:00").getTime()) / 86400000));
}

function agingCls(dias: number) {
  return dias > 30 ? "high" : dias > 15 ? "warn" : "ok";
}

function fmtF(s: string | null) {
  return s ? new Date(s + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

interface ItemForm {
  item: string;
  cantidad: string;
  vr_unit: string;
}

const ITEM0: ItemForm = { item: "", cantidad: "", vr_unit: "" };
const FORM0 = { numero: "", contrato: "alquiler" as "alquiler" | "emergencia", fecha_generacion: "", fecha_vencimiento: "", centro_costo: "", periodo: "", lugar: "", nota: "" };

export function PrefacturasClient({ initialRows, demo }: { initialRows: PrefacturaRow[]; demo: boolean }) {
  const [rows, setRows] = useState<PrefacturaRow[]>(initialRows);
  // N° consecutivo automático (informativo; el servidor asigna el definitivo)
  const proximoNumero = `N° ${String(Math.max(0, ...rows.map((r) => parseInt(String(r.numero ?? "").replace(/\D/g, ""), 10) || 0)) + 1).padStart(4, "0")} (automático)`;
  const [form, setForm] = useState(FORM0);
  const [items, setItems] = useState<ItemForm[]>([{ ...ITEM0 }]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const catalogo = catalogoDe(form.contrato);
  const activas = useMemo(() => rows.filter((r) => r.estado === "en_conciliacion" || r.estado === "con_orden"), [rows]);
  const totalActivo = activas.reduce((s, r) => s + Number(r.valor_base), 0);
  const totalConOrden = activas.filter((r) => r.estado === "con_orden").reduce((s, r) => s + Number(r.valor_base), 0);
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

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (demo) { setError("Modo demostración: conecta Supabase (ejecuta supabase/aaa_prefacturas.sql) para registrar prefacturas reales."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/aaa/prefacturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contrato: form.contrato,
          fecha_generacion: form.fecha_generacion,
          fecha_vencimiento: form.fecha_vencimiento || null,
          centro_costo: form.centro_costo.trim() || null,
          periodo: form.periodo.trim() || null,
          lugar: form.lugar.trim() || null,
          nota: form.nota.trim() || null,
          items: items
            .filter((it) => it.item)
            .map((it) => ({ item: it.item, cantidad: Number(it.cantidad), vr_unit: Number(it.vr_unit) })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al guardar");
      setRows((r) => [body.prefactura, ...r]);
      setForm(FORM0);
      setItems([{ ...ITEM0 }]);
      setMostrarForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function cambiarEstado(row: PrefacturaRow, estado: string) {
    if (demo) { setError("Modo demostración: conecta Supabase para actualizar."); return; }
    const patch: Record<string, unknown> = { id: row.id, estado };
    if (estado === "facturada" && !row.numero_factura) {
      const num = window.prompt("Número de factura (opcional):");
      if (num) { patch.numero_factura = num; patch.fecha_factura = new Date().toISOString().slice(0, 10); }
    }
    const res = await fetch("/api/aaa/prefacturas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await res.json();
    if (!res.ok) { setError(body.error ?? "Error al actualizar"); return; }
    setRows((rs) => rs.map((r) => (r.id === row.id ? body.prefactura : r)));
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-ico s-warn"><IconAlert /></span><span className="kpi-label">En prefactura (activo, sin IVA)</span></div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(totalActivo)}</div>
          <div className="kpi-foot">{activas.length} prefactura{activas.length === 1 ? "" : "s"} — ejecutado y pagado, sin facturar</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-ico"><IconChart /></span><span className="kpi-label">Con IVA (19%)</span></div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(totalActivo * (1 + CORTE.iva_pct))}</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-ico s-ok"><IconCheck /></span><span className="kpi-label">Con orden de facturación</span></div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{COP.format(totalConOrden)}</div>
          <div className="kpi-foot">listas para emitir factura</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className={`kpi-ico ${masAntigua > 30 ? "s-high" : masAntigua > 15 ? "s-warn" : ""}`}><IconCoins /></span><span className="kpi-label">Más antigua sin facturar</span></div>
          <div className="kpi-value">{masAntigua} días</div>
          <div className="kpi-foot">capital de trabajo atrapado en conciliación</div>
        </div>
      </div>

      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>Registro de prefacturas</span>
        <span className="topbar-spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => setMostrarForm((m) => !m)}>
          {mostrarForm ? "Cancelar" : "Registrar prefactura"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={crear} className="table-wrap" style={{ padding: 18, display: "grid", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <input className="input" readOnly value={proximoNumero} title="Se asigna automáticamente de forma consecutiva" style={{ background: "var(--surface-2)", color: "var(--text-2)" }} />
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
              <div key={i} style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(240px, 2fr) 110px 150px 130px 34px", alignItems: "center" }}>
                <select className="input" required value={it.item} onChange={(e) => elegirItem(i, e.target.value)}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems((arr) => [...arr, { ...ITEM0 }])}>+ Agregar ítem</button>
            <span className="topbar-spacer" style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 13 }}>
              Subtotal <b className="num">{COP.format(totalForm)}</b> · IVA <b className="num">{COP.format(totalForm * CORTE.iva_pct)}</b> · Total <b className="num">{COP.format(totalForm * (1 + CORTE.iva_pct))}</b>
            </span>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar prefactura"}</button>
          </div>
          {error && <div style={{ color: "var(--high)", fontSize: 13 }}>{error}</div>}
        </form>
      )}
      {!mostrarForm && error && <div style={{ color: "var(--high)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead>
            <tr>
              <th>N°</th>
              <th>Contrato</th>
              <th>Período / lugar</th>
              <th style={{ textAlign: "right" }}>Valor sin IVA</th>
              <th style={{ textAlign: "right" }}>Con IVA</th>
              <th>Antigüedad</th>
              <th>Estado</th>
              <th>Factura</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ padding: 18 }}>Sin prefacturas registradas.</td></tr>
            )}
            {rows.map((r) => {
              const est = ESTADOS[r.estado] ?? { label: r.estado, cls: "warn" };
              const activa = r.estado === "en_conciliacion" || r.estado === "con_orden";
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
                    <td><span className={`badge ${est.cls}`}>{est.label}</span></td>
                    <td className="muted">{r.numero_factura ? `${r.numero_factura} · ${fmtF(r.fecha_factura)}` : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      {r.estado === "en_conciliacion" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => cambiarEstado(r, "con_orden")}>Orden recibida</button>
                      )}
                      {(r.estado === "en_conciliacion" || r.estado === "con_orden") && (
                        <button className="btn btn-primary btn-sm" style={{ marginLeft: 6 }} onClick={() => cambiarEstado(r, "facturada")}>Facturada</button>
                      )}
                      {(r.estado === "en_conciliacion" || r.estado === "con_orden") && (
                        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6, color: "var(--high)" }} onClick={() => cambiarEstado(r, "rechazada")}>Rechazar</button>
                      )}
                      {r.estado === "facturada" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => cambiarEstado(r, "pagada")}>Marcar pagada</button>
                      )}
                      {r.estado === "rechazada" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => cambiarEstado(r, "en_conciliacion")}>Reabrir</button>
                      )}
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
