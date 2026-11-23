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
import { ALCANCE_RECOLECCION, AREAS_RECOLECCION, servicioRecoleccionDe, TARIFARIO_RECOLECCION_DEFAULT, volquetaDe } from "@/lib/transporte/constants";
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

  // Transporte AAA — costo a contratistas por ruta (uso interno), editable junto a la venta.
  const [draftCosto, setDraftCosto] = useState<Draft | null>(null);
  const [nuevoEquipo, setNuevoEquipo] = useState("");
  const [nuevaTarifa, setNuevaTarifa] = useState<Record<string, { tipo: "hora" | "transporte"; zona: string; valor: string }>>({});
  const conCosto = t.ns === "transporte" && !!t.tarifarioCosto;

  // Sincroniza el borrador con el tarifario vivo mientras no haya edición local.
  useEffect(() => {
    if (t.tarifario && !dirty) setDraft(draftFrom(t.tarifario));
    if (t.tarifarioCosto && !dirty) setDraftCosto(draftFrom(t.tarifarioCosto));
  }, [t.tarifario, t.tarifarioCosto, dirty]);

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
  const setCosto = (key: string, v: string) => {
    setDirty(true);
    setOk(null);
    setDraftCosto((d) => (d ? { ...d, valores: { ...d.valores, [key]: v } } : d));
  };
  const setRecargoCosto = (campo: "recNocturno" | "recDominical", v: string) => {
    setDirty(true);
    setOk(null);
    setDraftCosto((d) => (d ? { ...d, [campo]: v } : d));
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
      if (conCosto && draftCosto && t.tarifarioCosto) {
        const tc = t.tarifarioCosto;
        await t.saveTarifarioCostoCfg({
          recargos: { nocturno: num(draftCosto.recNocturno), dominicalFestivo: num(draftCosto.recDominical) },
          categorias: tc.categorias.map((c) => ({
            ...c,
            rutas: c.rutas.map((r) => ({ ...r, unitario: num(draftCosto.valores[`${c.id}|${r.id}`] ?? r.unitario) })),
          })),
        });
      }
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

  // ── Contratos creados en la app: armar el tarifario (equipos / servicios y sus tarifas) ──
  const esApp = !!t.ficha.dinamico;
  // Contrato de Recolección: precios por hora del formulario de precios (Anexo 2), registrados a mano.
  const esRecoleccion = t.ns === "recoleccion";
  /** Horas proyectadas (Cláusula Cuarta) del ítem volqueta × tipo de servicio. */
  const horasProyectadas = (catLabel: string, rutaLabel: string) =>
    ALCANCE_RECOLECCION.find((x) => x.volqueta === volquetaDe(catLabel) && x.servicio === servicioRecoleccionDe(rutaLabel))?.horas ?? null;
  // Recolección también puede sumar servicios nuevos (acordados con Triple A por otrosí);
  // los 4 ítems del contrato firmado no se pueden quitar.
  const editaEstructura = esApp || esRecoleccion;
  const esItemContrato = (catId: string, rutaId?: string) => {
    if (!esRecoleccion) return false;
    const cat = TARIFARIO_RECOLECCION_DEFAULT.categorias.find((c) => c.id === catId);
    return !!cat && (rutaId === undefined || cat.rutas.some((r) => r.id === rutaId));
  };
  const sinPrecio = esRecoleccion
    ? tarifario.categorias.flatMap((c) => c.rutas.filter((r) => !(num(draft.valores[`${c.id}|${r.id}`]) > 0)).map((r) => `${c.label.replace(/^Ítem \d+ · Servicio de /, "")} · ${r.label.replace(/\s*\(HR\)\s*$/, "")}`))
    : [];
  const usosRuta = (catId: string, rutaId?: string) =>
    Object.values(t.servicesByMonth).flat().filter((sv) => sv.tarifaCategoria === catId && (!rutaId || sv.tarifaRuta === rutaId)).length;
  const guardarEstructura = async (next: Tarifario, msg: string) => {
    if (dirty) { setError("Guarda o descarta primero los cambios de valores."); return; }
    setError(null);
    setOk(null);
    try {
      await t.saveTarifarioCfg(next);
      setOk(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el tarifario.");
    }
  };
  const agregarEquipo = async () => {
    const nombre = nuevoEquipo.trim();
    if (!nombre) return;
    const normal = (x: string) => x.replace(/^Ítem \d+ · Servicio de /i, "").trim().toLocaleLowerCase("es");
    if (tarifario.categorias.some((c) => normal(c.label) === normal(nombre))) { setError(`«${nombre}» ya está en el tarifario.`); return; }
    const n = tarifario.categorias.length + 1;
    await guardarEstructura(
      { ...tarifario, categorias: [...tarifario.categorias, { id: `eq${Date.now().toString(36)}`, label: `Ítem ${n} · Servicio de ${nombre}`, capacidad: "", rutas: [] }] },
      `«${nombre}» agregado. Ahora agrégale sus tarifas.`,
    );
    setNuevoEquipo("");
  };
  const agregarTarifa = async (catId: string) => {
    const f = nuevaTarifa[catId] ?? { tipo: "hora", zona: "", valor: "" };
    const zona = f.zona.trim();
    // Recolección: solo tarifas por hora; la «zona» es el tipo de servicio (= área AAA solicitante).
    const tipo = esRecoleccion ? "hora" : f.tipo;
    if (!zona || !(num(f.valor) > 0)) { setError(esRecoleccion ? "Indica el tipo de servicio y un valor por hora mayor que cero." : "Indica la zona y un valor mayor que cero."); return; }
    const idx = tarifario.categorias.findIndex((c) => c.id === catId) + 1;
    const cat = tarifario.categorias.find((c) => c.id === catId)!;
    let k = cat.rutas.length + 1;
    while (cat.rutas.some((r) => r.id === `${idx}.${k}`)) k += 1;
    const label = tipo === "hora" ? `${zona} (HR)` : `Transporte del equipo · ${zona}`;
    if (cat.rutas.some((r) => r.label.toLocaleLowerCase("es") === label.toLocaleLowerCase("es"))) { setError(`«${cat.label}» ya tiene la tarifa «${label}».`); return; }
    await guardarEstructura(
      { ...tarifario, categorias: tarifario.categorias.map((c) => (c.id === catId ? { ...c, rutas: [...c.rutas, { id: `${idx}.${k}`, label, unitario: num(f.valor) }] } : c)) },
      `Tarifa «${label}» agregada.`,
    );
    // Recolección: un tipo de servicio nuevo queda también como área AAA solicitante.
    if (esRecoleccion && t.admin && !t.admin.areas.includes(zona)) {
      await t.saveAdminCfg((a) => { if (!a.areas.includes(zona)) a.areas.push(zona); }).catch(() => undefined);
    }
    setNuevaTarifa((p) => ({ ...p, [catId]: { tipo: f.tipo, zona: "", valor: "" } }));
  };
  const quitarTarifa = async (catId: string, rutaId: string, label: string) => {
    const usos = usosRuta(catId, rutaId);
    if (usos > 0) { setError(`No se puede quitar «${label}»: la usan ${usos} registro(s).`); return; }
    if (!window.confirm(`¿Quitar la tarifa «${label}»?`)) return;
    await guardarEstructura(
      { ...tarifario, categorias: tarifario.categorias.map((c) => (c.id === catId ? { ...c, rutas: c.rutas.filter((r) => r.id !== rutaId) } : c)) },
      `Tarifa «${label}» quitada.`,
    );
  };
  const quitarEquipo = async (catId: string, label: string) => {
    const usos = usosRuta(catId);
    if (usos > 0) { setError(`No se puede quitar «${label}»: la usan ${usos} registro(s).`); return; }
    if (!window.confirm(`¿Quitar «${label}» y sus tarifas?`)) return;
    await guardarEstructura({ ...tarifario, categorias: tarifario.categorias.filter((c) => c.id !== catId) }, `«${label}» quitado.`);
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
      <div className="section-title">{esRecoleccion ? "Tarifario del contrato (formulario de precios — Anexo 2)" : "Tarifario de precios (Formulario de Cantidades y Precios)"}</div>
      {esRecoleccion ? (
        <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
          Precio de la <b>hora efectiva</b> de cada volqueta según el tipo de servicio. Digita el valor <b>sin IVA</b>:
          el contrato da el precio con IVA incluido, así que divídelo entre 1,19 (el registro le suma el IVA del 19%).
          La hora es a todo costo (conductor, ayudantes, combustible, peajes, mantenimiento, GPS, lavado), sin
          recargos. Junto a cada tarifa se muestran las horas proyectadas a 12 meses (Cláusula Cuarta). Los cambios
          se guardan para todo el equipo.
        </p>
      ) : (
      <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
        Tarifas del pliego para el cálculo automático del valor de cada servicio. Edítalas si hay un
        otrosí u OFAC. Los cambios se guardan para todo el equipo.
        {conCosto && " La columna «Costo contratista» es el valor neto que AG paga por viaje (uso interno: no sale en PDF ni exportaciones); un cambio aplica a los servicios nuevos, los ya registrados conservan su costo."}
      </p>
      )}

      {sinPrecio.length > 0 && (
        <div className="info-bar" role="status" style={{ marginBottom: 14, background: "var(--warn-soft)", borderColor: "var(--warn)" }}>
          <b>Faltan precios:</b> {sinPrecio.join("; ")}. Mientras estén en 0, los registros de ese ítem quedan sin valor.
        </div>
      )}

      {tarifario.categorias.length === 0 && (
        <div className="info-bar" style={{ marginBottom: 14 }}>
          Este contrato aún no tiene precios unitarios cargados: los registros llevan el valor digitado (tarifa manual).
          {editaEstructura && " Agrega abajo los equipos o servicios del contrato y sus tarifas por zona."}
        </div>
      )}

      {editaEstructura && (
        <div className="table-wrap" style={{ padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b style={{ fontSize: 13 }}>{esRecoleccion ? "Agregar servicio nuevo" : "Agregar equipo o servicio"}</b>
          <input className="input" style={{ maxWidth: 320 }} aria-label={esRecoleccion ? "Nombre del servicio nuevo" : "Nombre del equipo o servicio"}
            placeholder={esRecoleccion ? "Ej. Minicargador, Volqueta 6 m³…" : "Ej. Volqueta doble troque, Compactador…"} value={nuevoEquipo}
            onChange={(e) => setNuevoEquipo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void agregarEquipo(); }} />
          <button className="btn btn-primary btn-sm" onClick={() => void agregarEquipo()} disabled={t.saving || !nuevoEquipo.trim()}>+ Agregar</button>
          <span className="muted" style={{ fontSize: 12 }}>
            {esRecoleccion
              ? "Para servicios que la empresa empiece a ofrecer (acordados con Triple A por otrosí). Luego agrégale su valor por hora para cada tipo de servicio. Los ítems del contrato firmado no se pueden quitar."
              : "Luego agrégale sus tarifas: por hora (por zona) y, si aplica, el transporte del equipo."}
          </span>
        </div>
      )}

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

      <div className="tarifa-grid">
        {tarifario.categorias.map((cat) => (
          <div key={cat.id} className="table-wrap tarifa-card">
            <h3 className="tarifa-card-head">
              <span style={{ flex: 1 }}>
                {cat.label}
                {esRecoleccion && <span className={`badge ${esItemContrato(cat.id) ? "ok" : "warn"}`} style={{ marginLeft: 8, fontSize: 10.5, verticalAlign: "middle" }}>{esItemContrato(cat.id) ? "Contrato" : "Adicional"}</span>}
              </span>
              {editaEstructura && !esItemContrato(cat.id) && <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)" }} title="Quitar" aria-label={`Quitar ${cat.label}`} onClick={() => void quitarEquipo(cat.id, cat.label)}>×</button>}
            </h3>
            <div className="muted" style={{ fontSize: 12 }}>
              {esRecoleccion
                ? volquetaDe(cat.label) ? `Valor por hora efectiva sin IVA · volco mínimo ${volquetaDe(cat.label) === "sencilla" ? "7" : "14"} m³` : "Valor por hora efectiva sin IVA · servicio adicional (sin horas proyectadas en el contrato)"
                : num(cat.capacidad) > 0 ? `Capacidad mínima sugerida: ${num(cat.capacidad)} Ton` : "Valores unitarios sin IVA (HR = hora máquina)"}
            </div>
            <div className="tarifa-filas">
              {cat.rutas.map((ruta) => {
                const key = `${cat.id}|${ruta.id}`;
                const venta = num(draft.valores[key]);
                const costo = conCosto && draftCosto ? num(draftCosto.valores[key]) : 0;
                return (
                  <div key={ruta.id} className="tarifa-fila">
                    <span className="tarifa-fila-label">
                      <b>{ruta.id}</b> · {esRecoleccion ? ruta.label.replace(/\s*\(HR\)\s*$/, "") : ruta.label}
                      {esRecoleccion && horasProyectadas(cat.label, ruta.label) !== null && (
                        <span className="cc-dias">{horasProyectadas(cat.label, ruta.label)!.toLocaleString("es-CO")} h proyectadas</span>
                      )}
                      {editaEstructura && !esItemContrato(cat.id, ruta.id) && <button className="btn btn-ghost btn-sm" style={{ color: "var(--high)", padding: "0 6px" }} title="Quitar tarifa" aria-label={`Quitar tarifa ${ruta.label}`} onClick={() => void quitarTarifa(cat.id, ruta.id, ruta.label)}>×</button>}
                    </span>
                    {/* Cada valor lleva su etiqueta encima: sigue legible aunque la fila se parta en dos líneas. */}
                    <div className="tarifa-valores">
                    <label className="tarifa-valor">{conCosto ? "Venta (pliego)" : esRecoleccion ? "Valor hora sin IVA" : "Valor sin IVA"}
                      <input
                        className="input num"
                        type="number"
                        min={0}
                        step={1}
                        value={draft.valores[key] ?? ""}
                        onChange={(e) => setValor(key, e.target.value)}
                        aria-label={`Valor unitario ruta ${ruta.id}`}
                      />
                    </label>
                    {conCosto && draftCosto && (
                      <label className="tarifa-valor">Costo contratista
                        <input
                          className="input num"
                          type="number"
                          min={0}
                          step={1}
                          value={draftCosto.valores[key] ?? ""}
                          onChange={(e) => setCosto(key, e.target.value)}
                          style={{ background: "var(--surface-2)" }}
                          aria-label={`Costo contratista ruta ${ruta.id}`}
                          title={costo > 0 ? `Margen ${fmtCOP(venta - costo)}${venta > 0 ? ` (${(((venta - costo) / venta) * 100).toFixed(1)}%)` : ""}` : "Sin costo"}
                        />
                      </label>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Recolección: los ítems del contrato firmado no reciben tipos de servicio nuevos; solo los servicios adicionales. */}
            {editaEstructura && !esItemContrato(cat.id) && (() => {
              const f = nuevaTarifa[cat.id] ?? { tipo: "hora" as const, zona: "", valor: "" };
              const setNT = (patch: Partial<typeof f>) => setNuevaTarifa((p) => ({ ...p, [cat.id]: { ...f, ...patch } }));
              return (
                <div className="tarifa-nueva">
                  {!esRecoleccion && (
                    <select className="input" value={f.tipo} aria-label="Tipo de tarifa" onChange={(e) => setNT({ tipo: e.target.value as "hora" | "transporte" })}>
                      <option value="hora">Por hora</option>
                      <option value="transporte">Transporte del equipo (viaje)</option>
                    </select>
                  )}
                  <input className="input" aria-label={esRecoleccion ? "Tipo de servicio" : "Zona"} list={esRecoleccion ? `tipos-servicio-${cat.id}` : undefined}
                    placeholder={esRecoleccion ? "Tipo de servicio" : "Zona (ej. Municipios)"} value={f.zona} onChange={(e) => setNT({ zona: e.target.value })} />
                  {esRecoleccion && (
                    <datalist id={`tipos-servicio-${cat.id}`}>
                      {[...new Set([...AREAS_RECOLECCION, ...(t.admin?.areas ?? [])])].map((a) => <option key={a} value={a} />)}
                    </datalist>
                  )}
                  <input className="input num" type="number" min={0} step={1} aria-label="Valor sin IVA" placeholder={esRecoleccion ? "Valor hora sin IVA" : "Valor sin IVA"} value={f.valor} onChange={(e) => setNT({ valor: e.target.value })} />
                  <button className="btn btn-ghost btn-sm" onClick={() => void agregarTarifa(cat.id)} disabled={t.saving}>+ Tarifa</button>
                </div>
              );
            })()}
          </div>
        ))}

        {/* Recolección: el contrato no tiene recargos (la hora efectiva es a todo costo). */}
        {!esRecoleccion && (
        <div className="table-wrap tarifa-card">
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
            {conCosto && draftCosto && (
              <>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 6 }}>Costo de recargos al contratista <span className="muted" style={{ fontWeight: 400 }}>· uso interno</span></div>
                <label className="field">Costo recargo nocturno (COP)
                  <input className="input num" type="number" min={0} step={1} value={draftCosto.recNocturno}
                    onChange={(e) => setRecargoCosto("recNocturno", e.target.value)} style={{ textAlign: "right", background: "var(--surface-2)" }} />
                </label>
                <label className="field">Costo recargo dominical y festivo (COP)
                  <input className="input num" type="number" min={0} step={1} value={draftCosto.recDominical}
                    onChange={(e) => setRecargoCosto("recDominical", e.target.value)} style={{ textAlign: "right", background: "var(--surface-2)" }} />
                </label>
              </>
            )}
          </div>
        </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => void guardar()} disabled={t.saving}>
          {t.saving ? "Guardando…" : "Guardar tarifario"}
        </button>
        {/* Recolección: los precios se registran a mano; restablecer los dejaría en 0. */}
        {!esApp && !esRecoleccion && (
          <button className="btn btn-ghost" onClick={() => void restablecer()} disabled={t.saving}>
            Restablecer valores del formulario vigente
          </button>
        )}
        {dirty && <span className="muted" style={{ fontSize: 13 }}>Hay cambios sin guardar.</span>}
        <MsgInline error={error} ok={ok} />
      </div>
    </>
  );
}
