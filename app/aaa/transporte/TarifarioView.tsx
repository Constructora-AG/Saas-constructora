"use client";
// ════════════════════════════════════════════════════════════════════
// Vista Tarifario — Formulario de Cantidades y Precios (SPEC §5.3).
// Edita los unitarios por categoría × ruta y los recargos, y guarda el
// tarifario completo con t.saveTarifarioCfg (sincronizado para el equipo).
// Según SPEC §5.3 la edición NO está restringida por perfil.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import type { ViewProps } from "@/lib/transporte/useTransporte";
import type { Tarifario } from "@/lib/transporte/model";
import { num } from "@/lib/transporte/model";
import { fmtCOP, recalcularValores } from "@/lib/transporte/logic";
import { MsgInline } from "./CatalogoTabla";

/** Estado editable: unitarios por "catId|rutaId" + recargos, como strings. */
interface Draft {
  valores: Record<string, string>;
  recNocturno: string;
  recDominical: string;
}

function draftFrom(t: Tarifario): Draft {
  const valores: Record<string, string> = {};
  t.categorias.forEach((c) => c.rutas.forEach((r) => { valores[`${c.id}|${r.id}`] = String(num(r.unitario)); }));
  return {
    valores,
    recNocturno: String(num(t.recargos.nocturno)),
    recDominical: String(num(t.recargos.dominicalFestivo)),
  };
}

export function TarifarioView({ t }: ViewProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Sincroniza el borrador con el tarifario vivo mientras no haya edición local.
  useEffect(() => {
    if (t.tarifario && !dirty) setDraft(draftFrom(t.tarifario));
  }, [t.tarifario, dirty]);

  // Servicios registrados cuyo valor no coincide con el tarifario vigente (solo Transporte:
  // en Contrato de Alquiler el valor sale de horas máquina, no de la ruta).
  const desactualizados = useMemo(
    () => (t.ns === "transporte" && t.tarifario ? recalcularValores(t.servicesByMonth, t.tarifario) : null),
    [t.ns, t.tarifario, t.servicesByMonth],
  );

  if (!t.tarifario || !draft) {
    return (
      <div className="table-wrap" style={{ padding: 18 }}>
        <span className="muted">Cargando tarifario…</span>
      </div>
    );
  }
  const tarifario = t.tarifario;

  const setValor = (key: string, v: string) => {
    setDirty(true);
    setOk(null);
    setDraft((d) => (d ? { ...d, valores: { ...d.valores, [key]: v } } : d));
  };
  const setRecargo = (campo: "recNocturno" | "recDominical", v: string) => {
    setDirty(true);
    setOk(null);
    setDraft((d) => (d ? { ...d, [campo]: v } : d));
  };

  const guardar = async () => {
    setError(null);
    setOk(null);
    const nuevo: Tarifario = {
      recargos: { nocturno: num(draft.recNocturno), dominicalFestivo: num(draft.recDominical) },
      categorias: tarifario.categorias.map((c) => ({
        ...c,
        rutas: c.rutas.map((r) => ({ ...r, unitario: num(draft.valores[`${c.id}|${r.id}`] ?? r.unitario) })),
      })),
    };
    try {
      await t.saveTarifarioCfg(nuevo);
      setDirty(false);
      setOk("Tarifario guardado. Los nuevos servicios usarán estos valores.");
      if (t.ns === "transporte" && recalcularValores(t.servicesByMonth, nuevo).servicios > 0) {
        setOk("Tarifario guardado. Usa «Actualizar servicios registrados» para aplicarlo a los servicios ya cargados.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el tarifario.");
    }
  };

  const actualizarServicios = async () => {
    if (!desactualizados || desactualizados.servicios === 0) return;
    const { servicios, facturados, diferencia } = desactualizados;
    const aviso =
      `Se actualizará el valor de ${servicios} servicio(s) registrado(s) con el tarifario vigente ` +
      `(diferencia total ${diferencia < 0 ? "-" : "+"}${fmtCOP(Math.abs(diferencia))}).` +
      (facturados ? `\n\n${facturados} de ellos ya están facturados o prefacturados.` : "") +
      "\n\nLos servicios con tarifa manual no se modifican. ¿Continuar?";
    if (!window.confirm(aviso)) return;
    setError(null);
    setOk(null);
    try {
      const r = await t.recalcularServicios(tarifario);
      setOk(`${r.servicios} servicio(s) actualizado(s) con el tarifario vigente.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron actualizar los servicios.");
    }
  };

  const restablecer = async () => {
    if (!window.confirm("¿Restablecer el tarifario a los valores del Formulario de Cantidades y Precios vigente? Se perderán los cambios manuales.")) return;
    setError(null);
    setOk(null);
    try {
      await t.resetTarifario();
      setDirty(false);
      setOk("Tarifario restablecido a los valores del pliego.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo restablecer el tarifario.");
    }
  };

  return (
    <>
      <div className="section-title">Tarifario de precios (Formulario de Cantidades y Precios)</div>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
        Tarifas del pliego para el cálculo automático del valor de cada servicio. Edítalas si hay un
        otrosí u OFAC. Los cambios se guardan para todo el equipo.
      </p>

      {desactualizados && desactualizados.servicios > 0 && !dirty && (
        <div
          className="table-wrap"
          style={{ padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
        >
          <span style={{ fontSize: 13, flex: "1 1 280px" }}>
            <b>{desactualizados.servicios} servicio(s) registrado(s)</b> tienen un valor distinto al de este tarifario
            (diferencia {desactualizados.diferencia < 0 ? "-" : "+"}{fmtCOP(Math.abs(desactualizados.diferencia))}).
          </span>
          <button className="btn btn-primary" onClick={() => void actualizarServicios()} disabled={t.saving}>
            {t.saving ? "Actualizando…" : "Actualizar servicios registrados"}
          </button>
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        {tarifario.categorias.map((cat) => (
          <div key={cat.id} className="table-wrap" style={{ padding: 18 }}>
            <h3 style={{ margin: "0 0 2px", fontSize: 14.5 }}>{cat.label}</h3>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Capacidad mínima sugerida: {num(cat.capacidad)} Ton
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {cat.rutas.map((ruta) => {
                const key = `${cat.id}|${ruta.id}`;
                return (
                  <div
                    key={ruta.id}
                    style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 10, alignItems: "center" }}
                  >
                    <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                      <b>{ruta.id}</b> · {ruta.label}
                    </span>
                    <input
                      className="input num"
                      type="number"
                      min={0}
                      step={1}
                      value={draft.valores[key] ?? ""}
                      onChange={(e) => setValor(key, e.target.value)}
                      style={{ textAlign: "right" }}
                      aria-label={`Valor unitario ruta ${ruta.id}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="table-wrap" style={{ padding: 18 }}>
          <h3 style={{ margin: "0 0 2px", fontSize: 14.5 }}>Recargos aplicables (cualquier categoría)</h3>
          <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Se suman al valor de la ruta cuando el servicio marca el recargo correspondiente.
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <label className="field">Recargo nocturno (COP)
              <input
                className="input num"
                type="number"
                min={0}
                step={1}
                value={draft.recNocturno}
                onChange={(e) => setRecargo("recNocturno", e.target.value)}
                style={{ textAlign: "right" }}
              />
            </label>
            <label className="field">Recargo dominical y festivo (COP)
              <input
                className="input num"
                type="number"
                min={0}
                step={1}
                value={draft.recDominical}
                onChange={(e) => setRecargo("recDominical", e.target.value)}
                style={{ textAlign: "right" }}
              />
            </label>
            <div className="muted" style={{ fontSize: 12 }}>
              Vigentes: nocturno {fmtCOP(draft.recNocturno)} · dominical/festivo {fmtCOP(draft.recDominical)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => void guardar()} disabled={t.saving}>
          {t.saving ? "Guardando…" : "Guardar tarifario"}
        </button>
        <button className="btn btn-ghost" onClick={() => void restablecer()} disabled={t.saving}>
          Restablecer valores del formulario vigente
        </button>
        {dirty && <span className="muted" style={{ fontSize: 13 }}>Hay cambios sin guardar.</span>}
        <MsgInline error={error} ok={ok} />
      </div>
    </>
  );
}
