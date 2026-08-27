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
import { useTransporteSession } from "@/lib/transporte/session";
import { MsgInline, VencBadge } from "./CatalogoTabla";

interface FormFlota {
  plate: string;
  tipo: string;
  capacity: string;
  driver: string;
  activo: "si" | "no";
  venceSoat: string;
  venceTecno: string;
}

const FORM_VACIO: FormFlota = { plate: "", tipo: "", capacity: "", driver: "", activo: "si", venceSoat: "", venceTecno: "" };

export function FlotaView({ t }: ViewProps) {
  const ses = useTransporteSession();
  const [form, setForm] = useState<FormFlota>(FORM_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const vehiculos = t.admin?.vehiculos ?? [];
  const conductores = (t.admin?.personal ?? []).filter((p) => p.activo !== false);
  // Aislamiento por rol: sin permiso «vehiculos» la vista es de solo lectura.
  const canEdit = ses.canEditFleet();

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
          v.activo = activo;
        } else {
          a.vehiculos.push({
            plate,
            tipo: form.tipo.trim() || undefined,
            capacity: form.capacity.trim(),
            driver: form.driver.trim(),
            activo,
            venceSoat: form.venceSoat || null,
            venceTecno: form.venceTecno || null,
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
      activo: v.activo !== false ? "si" : "no",
      venceSoat: v.venceSoat || "",
      venceTecno: v.venceTecno || "",
    });
  };

  const eliminar = async (plate: string) => {
    setError(null);
    setOk(null);
    if (!window.confirm("¿Eliminar este vehículo de la flota? No borra los servicios ya registrados con esa placa.")) return;
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
      <div className="section-title">Flota de vehículos</div>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
        Catálogo único de la flota: alimenta el desplegable de placas al registrar servicios (la
        capacidad y el conductor designado se autollenan) y las alertas de vencimiento de SOAT y
        tecnomecánica. Editan Gerencia y los perfiles con permiso de «Vehículos»; los demás la
        consultan en solo lectura.
      </p>

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
          <label className="field">Tipo / marca
            <input className="input" placeholder="Ej. Camión plancha JAC" value={form.tipo} onChange={setF("tipo")} />
          </label>
          <label className="field">Capacidad (Ton)
            <input className="input" type="number" min={0} step="0.1" value={form.capacity} onChange={setF("capacity")} />
          </label>
          <label className="field">Conductor designado
            <input className="input" list="tx-conductores-flota" value={form.driver} onChange={setF("driver")} />
            <datalist id="tx-conductores-flota">
              {conductores.map((p) => <option key={p.nombre} value={p.nombre} />)}
            </datalist>
          </label>
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
              <th>Placa</th>
              <th>Tipo / marca</th>
              <th>Modelo</th>
              <th style={{ textAlign: "right" }}>Cap. (Ton)</th>
              <th>Conductor</th>
              <th>SOAT</th>
              <th>Tecnomecánica</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vehiculos.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ padding: 18 }}>Sin vehículos en el catálogo.</td></tr>
            )}
            {vehiculos.map((v) => {
              const inactivo = v.activo === false;
              return (
                <tr key={v.plate} style={inactivo ? { opacity: 0.5 } : undefined}>
                  <td><b>{v.plate}</b></td>
                  <td>{v.tipo || v.marca || "—"}</td>
                  <td>{v.modelo === null || v.modelo === undefined || v.modelo === "" ? "—" : String(v.modelo)}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {num(v.capacity).toLocaleString("es-CO", { maximumFractionDigits: 1 })}
                  </td>
                  <td>{v.driver || "—"}</td>
                  <td><VencBadge fecha={v.venceSoat} /></td>
                  <td><VencBadge fecha={v.venceTecno} /></td>
                  <td><span className={`badge ${inactivo ? "high" : "ok"}`}>{inactivo ? "Inactivo" : "Activo"}</span></td>
                  <td className="row-actions" style={{ whiteSpace: "nowrap" }}>
                    {canEdit && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => editar(v.plate)}>Editar</button>{" "}
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }} onClick={() => void eliminar(v.plate)}>
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

    </>
  );
}
