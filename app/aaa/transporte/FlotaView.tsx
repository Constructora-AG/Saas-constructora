"use client";
// ════════════════════════════════════════════════════════════════════
// Vista Flota — catálogo de vehículos (SPEC §5.5, Decisión AG: sin claves).
// Upsert por placa (en actualización solo sobreescribe campos no vacíos,
// salvo `activo` que siempre se aplica), baja con confirm, semáforo de
// SOAT / tecnomecánica. Aislamiento por rol: gerencia o permiso
// «vehiculos» editan; los demás perfiles ven la tabla en SOLO LECTURA
// (sin formulario ni acciones).
// ════════════════════════════════════════════════════════════════════

import { useState, type FormEvent } from "react";
import type { ViewProps } from "@/lib/transporte/useTransporte";
import { num } from "@/lib/transporte/model";
import { ANTIGUEDAD_MAX_RECOLECCION, CAPACIDAD_MIN_M3, DISPONIBILIDAD_MIN_RECOLECCION, volquetaDe } from "@/lib/transporte/constants";
import { useTransporteSession } from "@/lib/transporte/session";
import { MsgInline, VencBadge } from "./CatalogoTabla";
import { ConfirmarEliminacion } from "@/app/components/ConfirmarEliminacion";

interface FormFlota {
  plate: string;
  tipo: string;
  capacity: string;
  driver: string;
  contratista: string;
  activo: "si" | "no";
  venceSoat: string;
  venceTecno: string;
  /** Contrato de Recolección */
  numeroInterno: string;
  modelo: string;
}

const FORM_VACIO: FormFlota = { plate: "", tipo: "", capacity: "", driver: "", contratista: "", activo: "si", venceSoat: "", venceTecno: "", numeroInterno: "", modelo: "" };

/** Contrato de Recolección: tipos de volqueta del contrato (Grupo 3). */
const TIPOS_VOLQUETA = ["Volqueta dobletroque", "Volqueta sencilla"];

export function FlotaView({ t }: ViewProps) {
  const ses = useTransporteSession();
  const [form, setForm] = useState<FormFlota>(FORM_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // Placa pendiente de confirmar su eliminación.
  const [porEliminar, setPorEliminar] = useState<string | null>(null);

  const vehiculos = t.admin?.vehiculos ?? [];
  const conductores = (t.admin?.personal ?? []).filter((p) => p.activo !== false);
  // Aislamiento por rol: sin permiso «vehiculos» la vista es de solo lectura.
  const canEdit = ses.canEditFleet();
  // Transporte AAA: contratista (propietario) de cada placa, para el detalle de dinero en contratistas.
  const conContratista = t.ns === "transporte";
  // Contrato de Recolección: volquetas en m³, N° interno, modelo (antigüedad) y disponibilidad mínima.
  const esRecoleccion = t.ns === "recoleccion";
  const anioActual = new Date().getFullYear();
  const activosPor = (tipo: "dobletroque" | "sencilla") => vehiculos.filter((v) => v.activo !== false && volquetaDe(v.tipo || v.marca) === tipo).length;
  /** Observaciones de un vehículo frente a los requisitos del contrato (Cláusula Cuarta). */
  const avisosRecoleccion = (v: (typeof vehiculos)[number]): string[] => {
    const out: string[] = [];
    const tipo = volquetaDe(v.tipo || v.marca);
    if (!tipo) out.push("Sin tipo de volqueta");
    else if (v.capacity !== "" && v.capacity != null && num(v.capacity) < CAPACIDAD_MIN_M3[tipo]) out.push(`Volco menor a ${CAPACIDAD_MIN_M3[tipo]} m³`);
    const anio = Number(v.modelo);
    if (Number.isFinite(anio) && anio > 1900 && anioActual - anio > ANTIGUEDAD_MAX_RECOLECCION) out.push(`Más de ${ANTIGUEDAD_MAX_RECOLECCION} años`);
    return out;
  };
  const contratistasConocidos = [...new Set(vehiculos.map((v) => (v.contratista ?? "").trim()).filter(Boolean))].sort();

  const setF = (k: keyof FormFlota) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const guardarNucleo = async () => {
    const plate = form.plate.trim().toUpperCase();
    if (!plate) { setError("La placa es obligatoria."); return; }
    const activo = form.activo === "si";
    try {
      await t.saveAdminCfg((a) => {
        const v = a.vehiculos.find((x) => x.plate === plate);
        if (v) {
          // Actualización: solo sobreescribe campos no vacíos (activo siempre).
          if (form.tipo.trim()) v.tipo = form.tipo.trim();
          if (form.capacity.trim()) v.capacity = form.capacity.trim();
          if (form.driver.trim()) v.driver = form.driver.trim();
          if (form.venceSoat) v.venceSoat = form.venceSoat;
          if (form.venceTecno) v.venceTecno = form.venceTecno;
          if (conContratista) v.contratista = form.contratista.trim() || undefined;
          if (esRecoleccion && form.numeroInterno.trim()) v.numeroInterno = form.numeroInterno.trim();
          if (esRecoleccion && form.modelo.trim()) v.modelo = form.modelo.trim();
          v.activo = activo;
        } else {
          a.vehiculos.push({
            plate,
            tipo: form.tipo.trim() || undefined,
            capacity: form.capacity.trim(),
            driver: form.driver.trim(),
            contratista: conContratista ? form.contratista.trim() || undefined : undefined,
            activo,
            venceSoat: form.venceSoat || null,
            venceTecno: form.venceTecno || null,
            ...(esRecoleccion ? { numeroInterno: form.numeroInterno.trim() || undefined, modelo: form.modelo.trim() || null } : {}),
          });
        }
      });
      setForm(FORM_VACIO);
      setOk(`Vehículo ${plate} guardado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el vehículo.");
    }
  };

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    void guardarNucleo();
  };

  const editar = (plate: string) => {
    const v = vehiculos.find((x) => x.plate === plate);
    if (!v) return;
    setOk(null);
    setError(null);
    setForm({
      plate: v.plate,
      tipo: v.tipo || v.marca || "",
      capacity: v.capacity === null || v.capacity === undefined ? "" : String(v.capacity),
      driver: v.driver || "",
      contratista: v.contratista || "",
      activo: v.activo !== false ? "si" : "no",
      venceSoat: v.venceSoat || "",
      venceTecno: v.venceTecno || "",
      numeroInterno: v.numeroInterno || "",
      modelo: v.modelo === null || v.modelo === undefined ? "" : String(v.modelo),
    });
  };

  const eliminar = async (plate: string) => {
    setError(null);
    setOk(null);
    try {
      await t.saveAdminCfg((a) => {
        a.vehiculos = a.vehiculos.filter((x) => x.plate !== plate);
      });
      setOk(`Vehículo ${plate} eliminado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el vehículo.");
    }
  };

  return (
    <>
      <div className="section-title">{esRecoleccion ? "Flota de volquetas" : "Flota de vehículos"}</div>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
        Catálogo único de la flota: alimenta el desplegable de placas al registrar servicios (la
        capacidad y el conductor designado se autollenan) y las alertas de vencimiento de SOAT y
        tecnomecánica. Editan Gerencia y los perfiles con permiso de «Vehículos»; los demás la
        consultan en solo lectura.
      </p>

      {esRecoleccion && (() => {
        const faltan = (["dobletroque", "sencilla"] as const).filter((k) => activosPor(k) < DISPONIBILIDAD_MIN_RECOLECCION[k]);
        return (
          <div className="info-bar" role="status" style={{ marginBottom: 14, ...(faltan.length ? { background: "var(--warn-soft)", borderColor: "var(--warn)" } : {}) }}>
            <b>Disponibilidad mínima del contrato:</b> {DISPONIBILIDAD_MIN_RECOLECCION.dobletroque} dobletroques y {DISPONIBILIDAD_MIN_RECOLECCION.sencilla} sencillas
            (activas: {activosPor("dobletroque")} dobletroque · {activosPor("sencilla")} sencilla).
            {faltan.length ? ` Faltan volquetas ${faltan.join(" y ")}.` : " Se cumple."}
            {" "}Volco mínimo: {CAPACIDAD_MIN_M3.dobletroque} m³ (dobletroque) y {CAPACIDAD_MIN_M3.sencilla} m³ (sencilla) · antigüedad máxima {ANTIGUEDAD_MAX_RECOLECCION} años.
          </div>
        );
      })()}

      {!canEdit && (
        <div className="info-bar" style={{ marginBottom: 14 }}>
          Tu perfil consulta la flota en solo lectura. Pide a Gerencia el permiso de «Vehículos» si
          necesitas editarla.
        </div>
      )}

      {canEdit && (
      <form onSubmit={guardar} className="table-wrap" style={{ padding: 18, display: "grid", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <label className="field">Placa *
            <input
              className="input"
              required
              placeholder="ABC-123 (existente = actualiza)"
              value={form.plate}
              onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
            />
          </label>
          {esRecoleccion ? (
            <>
              <label className="field">Tipo de volqueta
                <select value={form.tipo} onChange={setF("tipo")}>
                  <option value="">— Selecciona —</option>
                  {TIPOS_VOLQUETA.map((x) => <option key={x} value={x}>{x}</option>)}
                  {form.tipo && !TIPOS_VOLQUETA.includes(form.tipo) && <option value={form.tipo}>{form.tipo}</option>}
                </select>
              </label>
              <label className="field">N° interno
                <input className="input" placeholder="Ej. VD-03" value={form.numeroInterno} onChange={setF("numeroInterno")} />
              </label>
              <label className="field">Modelo (año)
                <input className="input" type="number" min={1950} max={anioActual + 1} step={1} value={form.modelo} onChange={setF("modelo")} />
              </label>
            </>
          ) : (
          <label className="field">Tipo / marca
            <input className="input" placeholder="Ej. Camión plancha JAC" value={form.tipo} onChange={setF("tipo")} />
          </label>
          )}
          <label className="field">{esRecoleccion ? "Capacidad del volco (m³)" : "Capacidad (Ton)"}
            <input className="input" type="number" min={0} step="0.1" value={form.capacity} onChange={setF("capacity")} />
          </label>
          <label className="field">Conductor designado
            <input className="input" list="tx-conductores-flota" value={form.driver} onChange={setF("driver")} />
            <datalist id="tx-conductores-flota">
              {conductores.map((p) => <option key={p.nombre} value={p.nombre} />)}
            </datalist>
          </label>
          {conContratista && (
            <label className="field">Contratista (propietario)
              <input className="input" list="tx-contratistas-flota" value={form.contratista} onChange={setF("contratista")} placeholder="A quién se le paga por esta placa" />
              <datalist id="tx-contratistas-flota">{contratistasConocidos.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
          )}
          <label className="field">Estado
            <select value={form.activo} onChange={setF("activo")}>
              <option value="si">Activo</option>
              <option value="no">Inactivo</option>
            </select>
          </label>
          <label className="field">Vence SOAT
            <input className="input" type="date" value={form.venceSoat} onChange={setF("venceSoat")} />
          </label>
          <label className="field">Vence tecnomecánica
            <input className="input" type="date" value={form.venceTecno} onChange={setF("venceTecno")} />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="submit" disabled={t.saving}>
            {t.saving ? "Guardando…" : "Guardar vehículo"}
          </button>
          <MsgInline error={error} ok={ok} />
        </div>
      </form>
      )}

      <div className="table-wrap table-scroll">
        <table className="clean">
          <thead>
            <tr>
              <th>{esRecoleccion ? "Placa / N° interno" : "Placa"}</th>
              <th>{esRecoleccion ? "Tipo" : "Tipo / marca"}</th>
              <th>Modelo</th>
              <th style={{ textAlign: "right" }}>{esRecoleccion ? "Volco (m³)" : "Cap. (Ton)"}</th>
              <th>Conductor</th>
              {conContratista && <th>Contratista</th>}
              <th>SOAT</th>
              <th>Tecnomecánica</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vehiculos.length === 0 && (
              <tr><td colSpan={conContratista ? 10 : 9} className="muted" style={{ padding: 18 }}>Sin vehículos en el catálogo.</td></tr>
            )}
            {vehiculos.map((v) => {
              const inactivo = v.activo === false;
              return (
                <tr key={v.plate} style={inactivo ? { opacity: 0.5 } : undefined}>
                  <td>
                    <b>{v.plate}</b>
                    {esRecoleccion && <span className="muted" style={{ display: "block", fontSize: 11.5, marginTop: 2 }}>{v.numeroInterno ? `N° interno ${v.numeroInterno}` : "Sin N° interno"}</span>}
                    {/* Los avisos pueden partirse en líneas para que la tabla quepa en el ancho. */}
                    {esRecoleccion && avisosRecoleccion(v).map((a) => <span key={a} className="badge warn" style={{ display: "block", marginTop: 3, width: "fit-content", whiteSpace: "normal" }}>{a}</span>)}
                  </td>
                  <td>{v.tipo || v.marca || "—"}</td>
                  <td>{v.modelo === null || v.modelo === undefined || v.modelo === "" ? "—" : String(v.modelo)}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {num(v.capacity).toLocaleString("es-CO", { maximumFractionDigits: 1 })}
                  </td>
                  <td>{v.driver || "—"}</td>
                  {conContratista && <td>{v.contratista || <span className="muted">Sin asignar</span>}</td>}
                  <td><VencBadge fecha={v.venceSoat} /></td>
                  <td><VencBadge fecha={v.venceTecno} /></td>
                  <td><span className={`badge ${inactivo ? "high" : "ok"}`}>{inactivo ? "Inactivo" : "Activo"}</span></td>
                  <td className="row-actions" style={{ whiteSpace: "nowrap" }}>
                    {canEdit && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => editar(v.plate)}>Editar</button>{" "}
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }} onClick={() => setPorEliminar(v.plate)}>
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
        titulo={`¿Eliminar el vehículo ${porEliminar ?? ""} de la flota?`}
        descripcion="Deja de aparecer en el catálogo y al registrar servicios. No borra los servicios ya registrados con esa placa."
        irreversible={false}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={async () => { if (porEliminar) await eliminar(porEliminar); setPorEliminar(null); }}
      />
    </>
  );
}
