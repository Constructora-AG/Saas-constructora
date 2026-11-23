"use client";
// ════════════════════════════════════════════════════════════════════
// Vista Personal — catálogo de conductores (SPEC §5.6, análogo a Flota,
// Decisión AG: sin claves). Upsert por nombre (en actualización solo
// sobreescribe campos no vacíos, salvo `activo`), baja con confirm y
// semáforo de licencia. Aislamiento por rol: gerencia o permiso
// «personal» editan; los demás ven la tabla en SOLO LECTURA.
// ════════════════════════════════════════════════════════════════════

import { useState, type FormEvent } from "react";
import type { ViewProps } from "@/lib/transporte/useTransporte";
import { useTransporteSession } from "@/lib/transporte/session";
import { MsgInline, VencBadge } from "./CatalogoTabla";
import { ConfirmarEliminacion } from "@/app/components/ConfirmarEliminacion";

interface FormPersonal {
  nombre: string;
  cedula: string;
  venceLicencia: string;
  activo: "si" | "no";
  /** Contrato de Recolección */
  rol: "conductor" | "ayudante";
  arl: "si" | "no";
}

const FORM_VACIO: FormPersonal = { nombre: "", cedula: "", venceLicencia: "", activo: "si", rol: "conductor", arl: "no" };

export function PersonalView({ t }: ViewProps) {
  const ses = useTransporteSession();
  const [form, setForm] = useState<FormPersonal>(FORM_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // Persona pendiente de confirmar su eliminación.
  const [porEliminar, setPorEliminar] = useState<string | null>(null);

  const personal = t.admin?.personal ?? [];
  // Aislamiento por rol: sin permiso «personal» la vista es de solo lectura.
  const canEdit = ses.canEditPersonal();
  // Contrato de Recolección: conductores y ayudantes (volqueta sencilla), todos con ARL nivel V.
  const esRecoleccion = t.ns === "recoleccion";
  const sinArl = esRecoleccion ? personal.filter((p) => p.activo !== false && !p.arlNivelV).length : 0;

  const guardarNucleo = async () => {
    const nombre = form.nombre.trim();
    if (!nombre) { setError("El nombre completo es obligatorio."); return; }
    const activo = form.activo === "si";
    try {
      await t.saveAdminCfg((a) => {
        const p = a.personal.find((x) => x.nombre === nombre);
        if (p) {
          // Actualización: solo sobreescribe campos no vacíos (activo siempre).
          if (form.cedula.trim()) p.cedula = form.cedula.trim();
          if (form.venceLicencia) p.venceLicencia = form.venceLicencia;
          if (esRecoleccion) { p.rol = form.rol; p.arlNivelV = form.arl === "si"; }
          p.activo = activo;
        } else {
          a.personal.push({
            nombre,
            cedula: form.cedula.trim(),
            activo,
            venceLicencia: form.venceLicencia || null,
            ...(esRecoleccion ? { rol: form.rol, arlNivelV: form.arl === "si" } : {}),
          });
        }
      });
      setForm(FORM_VACIO);
      setOk(`Registro de ${nombre} guardado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la persona.");
    }
  };

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    void guardarNucleo();
  };

  const editar = (nombre: string) => {
    const p = personal.find((x) => x.nombre === nombre);
    if (!p) return;
    setOk(null);
    setError(null);
    setForm({
      nombre: p.nombre,
      cedula: p.cedula || "",
      venceLicencia: p.venceLicencia || "",
      activo: p.activo !== false ? "si" : "no",
      rol: p.rol ?? "conductor",
      arl: p.arlNivelV ? "si" : "no",
    });
  };

  const eliminar = async (nombre: string) => {
    setError(null);
    setOk(null);
    try {
      await t.saveAdminCfg((a) => {
        a.personal = a.personal.filter((x) => x.nombre !== nombre);
      });
      setOk(`${nombre} se eliminó del catálogo.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la persona.");
    }
  };

  return (
    <>
      <div className="section-title">{esRecoleccion ? "Personal — conductores y ayudantes" : "Personal — conductores"}</div>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
        Catálogo de conductores: alimenta el desplegable de conductores al registrar servicios y las
        alertas de licencias por vencer. Editan Gerencia y los perfiles con permiso de «Personal»;
        los demás la consultan en solo lectura.
      </p>

      {esRecoleccion && (
        <div className="info-bar" role="status" style={{ marginBottom: 14, ...(sinArl ? { background: "var(--warn-soft)", borderColor: "var(--warn)" } : {}) }}>
          Conductores y ayudantes deben estar afiliados a riesgos laborales en <b>nivel V</b>; la volqueta sencilla lleva
          hasta 2 ayudantes con pala y cepillo (Cláusula Cuarta). La seguridad social al día se exige para radicar cada factura.
          {sinArl ? ` ${sinArl} persona(s) activa(s) sin ARL nivel V confirmada.` : ""}
        </div>
      )}

      {!canEdit && (
        <div className="info-bar" style={{ marginBottom: 14 }}>
          Tu perfil consulta el personal en solo lectura. Pide a Gerencia el permiso de «Personal»
          si necesitas editarlo.
        </div>
      )}

      {canEdit && (
      <form onSubmit={guardar} className="table-wrap" style={{ padding: 18, display: "grid", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label className="field">Nombre completo *
            <input
              className="input"
              required
              placeholder="Nombre (existente = actualiza)"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            />
          </label>
          <label className="field">N° de identificación
            <input className="input" value={form.cedula} onChange={(e) => setForm((f) => ({ ...f, cedula: e.target.value }))} />
          </label>
          {esRecoleccion && (
            <label className="field">Rol
              <select value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as "conductor" | "ayudante" }))}>
                <option value="conductor">Conductor</option>
                <option value="ayudante">Ayudante</option>
              </select>
            </label>
          )}
          {esRecoleccion && (
            <label className="field">ARL nivel V
              <select value={form.arl} onChange={(e) => setForm((f) => ({ ...f, arl: e.target.value as "si" | "no" }))}>
                <option value="si">Afiliado</option>
                <option value="no">Sin confirmar</option>
              </select>
            </label>
          )}
          <label className="field">{esRecoleccion ? "Vence licencia (conductores)" : "Vence licencia"}
            <input
              className="input"
              type="date"
              value={form.venceLicencia}
              onChange={(e) => setForm((f) => ({ ...f, venceLicencia: e.target.value }))}
            />
          </label>
          <label className="field">Estado
            <select value={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.value as "si" | "no" }))}>
              <option value="si">Activo</option>
              <option value="no">Inactivo</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="submit" disabled={t.saving}>
            {t.saving ? "Guardando…" : "Guardar persona"}
          </button>
          <MsgInline error={error} ok={ok} />
        </div>
      </form>
      )}

      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead>
            <tr>
              <th>Nombre</th>
              {esRecoleccion && <th>Rol</th>}
              <th>Identificación</th>
              <th>Vence licencia</th>
              {esRecoleccion && <th>ARL nivel V</th>}
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {personal.length === 0 && (
              <tr><td colSpan={esRecoleccion ? 7 : 5} className="muted" style={{ padding: 18 }}>Sin personal en el catálogo.</td></tr>
            )}
            {personal.map((p) => {
              const inactivo = p.activo === false;
              return (
                <tr key={p.nombre} style={inactivo ? { opacity: 0.5 } : undefined}>
                  <td><b>{p.nombre}</b></td>
                  {esRecoleccion && <td>{p.rol === "ayudante" ? "Ayudante" : "Conductor"}</td>}
                  <td className="num">{p.cedula || "—"}</td>
                  <td>{esRecoleccion && p.rol === "ayudante" ? <span className="muted">No aplica</span> : <VencBadge fecha={p.venceLicencia} />}</td>
                  {esRecoleccion && <td><span className={`badge ${p.arlNivelV ? "ok" : "warn"}`}>{p.arlNivelV ? "Afiliado" : "Sin confirmar"}</span></td>}
                  <td><span className={`badge ${inactivo ? "high" : "ok"}`}>{inactivo ? "Inactivo" : "Activo"}</span></td>
                  <td className="row-actions" style={{ whiteSpace: "nowrap" }}>
                    {canEdit && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => editar(p.nombre)}>Editar</button>{" "}
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }} onClick={() => setPorEliminar(p.nombre)}>
                          Eliminar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmarEliminacion
        abierto={porEliminar !== null}
        titulo={`¿Eliminar a ${porEliminar ?? ""} del catálogo de personal?`}
        descripcion="Deja de aparecer al registrar servicios. No borra los servicios ya registrados con su nombre."
        irreversible={false}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={async () => { if (porEliminar) await eliminar(porEliminar); setPorEliminar(null); }}
      />
    </>
  );
}
