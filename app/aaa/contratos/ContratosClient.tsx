"use client";
// ════════════════════════════════════════════════════════════════════
// Proyecto Triple A → Contratos. Crear un contrato aquí genera su módulo con la
// misma estructura de Contrato de Alquiler (registros por horas × valor hora de
// la zona + transporte del equipo, tarifario, reportes, flota, personal y
// administración) y datos propios: arranca vacío y nunca se mezcla con otros.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ContratoDinamico } from "@/lib/transporte/constants";
import { cargarContratos, guardarContratos, idContrato, prefijoSugerido } from "@/lib/transporte/contratos";
import { parseValor } from "../FacturasRegistro";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fFecha = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "—"; };
const FORM0 = { nombre: "", numero: "", objeto: "", valor: "", ivaIncluido: true, inicio: "", fin: "", prefijo: "" };

/** Avisa al menú lateral que la lista de contratos cambió. */
export const EVENTO_CONTRATOS = "ag:contratos-cambiaron";

export function ContratosClient() {
  const router = useRouter();
  const [lista, setLista] = useState<ContratoDinamico[] | null>(null);
  const [form, setForm] = useState(FORM0);
  const [editando, setEditando] = useState<ContratoDinamico | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    cargarContratos().then(setLista).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const prefijoAuto = useMemo(
    () => prefijoSugerido(form.nombre, (lista ?? []).filter((c) => c.id !== editando?.id).map((c) => c.prefijoOrden)),
    [form.nombre, lista, editando],
  );
  const set = (k: keyof typeof FORM0) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: k === "prefijo" ? e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) : e.target.value }));

  const nuevo = () => { setEditando(null); setForm(FORM0); setError(null); setOk(null); setAbierto(true); };
  const editar = (c: ContratoDinamico) => {
    setEditando(c);
    setForm({ nombre: c.nombre, numero: c.numero, objeto: c.objeto, valor: c.valor ? String(c.valor) : "", ivaIncluido: c.ivaIncluido, inicio: c.inicio, fin: c.fin, prefijo: c.prefijoOrden });
    setError(null); setOk(null); setAbierto(true);
  };

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(null);
    const actual = await cargarContratos().catch(() => lista ?? []); // fresco, por si otro usuario creó uno
    const nombre = form.nombre.trim();
    if (!nombre) { setError("El nombre del contrato es obligatorio."); return; }
    if (!editando) {
      if (!form.inicio || !form.fin) { setError("Indica la fecha de inicio y la de fin."); return; }
      if (form.fin <= form.inicio) { setError("La fecha de fin debe ser posterior a la de inicio."); return; }
    }
    const prefijo = (form.prefijo || prefijoAuto).toUpperCase();
    if (!/^[A-Z]{2,3}$/.test(prefijo)) { setError("El prefijo de órdenes debe tener 2 o 3 letras."); return; }
    if (["TP", "AL", "EM", "PF"].includes(prefijo) || actual.some((c) => c.prefijoOrden === prefijo && c.id !== editando?.id)) {
      setError(`El prefijo ${prefijo} ya está en uso.`); return;
    }
    const valor = form.valor.trim() ? parseValor(form.valor) : 0;
    if (!Number.isFinite(valor) || valor < 0) { setError("El valor del contrato no es válido."); return; }
    setGuardando(true);
    try {
      let siguiente: ContratoDinamico[];
      let destino: string | null = null;
      if (editando) {
        siguiente = actual.map((c) => (c.id === editando.id ? { ...c, nombre, numero: form.numero.trim(), objeto: form.objeto.trim(), prefijoOrden: prefijo } : c));
      } else {
        const id = idContrato(nombre, actual.map((c) => c.id));
        siguiente = [...actual, {
          id, nombre, numero: form.numero.trim(), objeto: form.objeto.trim(), valor, ivaIncluido: form.ivaIncluido,
          inicio: form.inicio, fin: form.fin, prefijoOrden: prefijo, creadoEn: new Date().toISOString(),
        }];
        destino = `/aaa/contratos/${id}`;
      }
      await guardarContratos(siguiente);
      setLista(siguiente);
      window.dispatchEvent(new Event(EVENTO_CONTRATOS));
      setAbierto(false);
      if (destino) router.push(destino);
      else setOk("Contrato actualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Contratos</h1>
        <p className="page-sub">
          Crea un contrato nuevo y se genera su módulo con la misma estructura de Contrato de Alquiler: registros (horas ×
          valor hora de la zona y transporte del equipo), tarifario, reportes, flota, personal y administración. Cada
          contrato tiene sus propios datos y arranca vacío.
        </p>
      </div>

      <div className="filters-bar">
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={nuevo}>+ Nuevo contrato</button>
      </div>
      {ok && <div style={{ color: "var(--ok)", fontSize: 13, marginBottom: 12 }}>{ok}</div>}
      {!abierto && error && <div style={{ color: "var(--high)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div className="table-wrap table-scroll">
        <table className="clean" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Contrato</th>
              <th>N°</th>
              <th>Vigencia</th>
              <th style={{ textAlign: "right" }}>Valor</th>
              <th>Órdenes</th>
              <th style={{ width: 170 }} />
            </tr>
          </thead>
          <tbody>
            {lista === null && <tr><td colSpan={6} className="muted">Cargando…</td></tr>}
            {lista?.length === 0 && <tr><td colSpan={6} className="muted">Aún no hay contratos creados en la app. Usa «+ Nuevo contrato».</td></tr>}
            {lista?.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/aaa/contratos/${c.id}`}><b>{c.nombre}</b></Link>{c.objeto && <span className="cc-dias">{c.objeto}</span>}</td>
                <td>{c.numero || "—"}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fFecha(c.inicio)} — {fFecha(c.fin)}</td>
                <td className="num" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{c.valor ? COP.format(c.valor) : "—"}{c.valor ? <span className="cc-dias">{c.ivaIncluido ? "IVA incluido" : "IVA excluido"}</span> : null}</td>
                <td>{c.prefijoOrden}0001…</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <Link className="btn btn-ghost btn-sm" href={`/aaa/contratos/${c.id}`}>Abrir</Link>{" "}
                  <button className="btn btn-ghost btn-sm" onClick={() => editar(c)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abierto && (
        <>
          <div className="drawer-overlay" onClick={() => setAbierto(false)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={editando ? "Editar contrato" : "Nuevo contrato"}>
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="drawer-title">{editando ? `Editar ${editando.nombre}` : "Nuevo contrato"}</h2>
                <span className="cc-dias">{editando ? "El valor y la vigencia se ajustan en Administración del módulo." : "Se crea su módulo con datos propios, vacío."}</span>
              </div>
              <button className="drawer-close" onClick={() => setAbierto(false)} title="Cerrar">×</button>
            </div>
            <div className="drawer-body">
              <form onSubmit={guardar} style={{ display: "grid", gap: 12 }}>
                <label className="field">Nombre del contrato *<input className="input" required placeholder="Ej. Contrato de Recolección" value={form.nombre} onChange={set("nombre")} /></label>
                <label className="field">N° de contrato<input className="input" placeholder="Ej. 2026-120" value={form.numero} onChange={set("numero")} /></label>
                <label className="field">Objeto<textarea className="input" rows={3} value={form.objeto} onChange={set("objeto")} /></label>
                {!editando && (
                  <>
                    <label className="field">Valor del contrato (COP)<input className="input" inputMode="decimal" placeholder="Ej. 1.500.000.000" value={form.valor} onChange={set("valor")} /></label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={form.ivaIncluido} onChange={(e) => setForm((f) => ({ ...f, ivaIncluido: e.target.checked }))} />
                      El valor incluye IVA
                    </label>
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                      <label className="field">Inicio *<input className="input" type="date" required value={form.inicio} onChange={set("inicio")} /></label>
                      <label className="field">Fin (inclusive) *<input className="input" type="date" required value={form.fin} onChange={set("fin")} /></label>
                    </div>
                  </>
                )}
                <label className="field">Prefijo de órdenes
                  <input className="input" placeholder={prefijoAuto} value={form.prefijo} onChange={set("prefijo")} style={{ maxWidth: 120 }} />
                  <span className="muted" style={{ fontSize: 12 }}>Las órdenes serán {(form.prefijo || prefijoAuto)}0001, {(form.prefijo || prefijoAuto)}0002…</span>
                </label>
                {error && <div style={{ color: "var(--high)", fontSize: 13 }}>{error}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear contrato"}</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setAbierto(false)}>Cancelar</button>
                </div>
              </form>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
