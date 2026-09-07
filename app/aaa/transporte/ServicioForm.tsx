"use client";
// ════════════════════════════════════════════════════════════════════
// Control Transporte AAA — Formulario de servicio (drawer)
// Nuevo / edición / duplicado (SPEC §4.4–4.6, §5.2):
// - Desplegables maestros encadenados (interventor, área AAA, placa →
//   capacidad + conductor designado, equipo → peso) con opción "Otro".
// - Tarifario: categoría → ruta → valor con recálculo (computeValor).
// - Recargos automáticos sáb/dom/festivo y nocturno 19:00–06:00 con
//   flags "touched": el ajuste manual del checkbox prevalece.
// - Evidencias fotográficas (compresión de media.ts) y V°B° (1 archivo).
// - Guardado sella el registro con el PERFIL ACTIVO (session.approve, sin
//   clave — Decisión AG: autenticación delegada a la plataforma).
// El llamador (RegistrosView) es responsable de t.setModalOpen(true/false).
// ════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { UseTransporte } from "@/lib/transporte/useTransporte";
import type { AdjuntoFile, AdminConfig, MonthInfo, NumLike, Servicio, Tarifario } from "@/lib/transporte/model";
import { areaAAADe, aprobadorDe, num, nuevoServicioId } from "@/lib/transporte/model";
import { autoRecargos, computeValor, fdate, fmtCOP, respHours } from "@/lib/transporte/logic";
import { openAttachment, processSelectedFile } from "@/lib/transporte/media";
import { useTransporteSession } from "@/lib/transporte/session";

const OTRO = "__otro__";
const TIPOS = ["Programado", "No Programado", "Emergencia"];

interface Campos {
  date: string;
  orderNo: string;
  serviceType: string;
  interventorSel: string;
  interventorOtro: string;
  areaAAASel: string;
  areaAAAOtro: string;
  plateSel: string;
  plateOtro: string;
  driverSel: string;
  operario: string;
  driverOtro: string;
  equipmentSel: string;
  equipmentOtro: string;
  capacity: string;
  weight: string;
  pickup: string;
  destination: string;
  area: string;
  hourReq: string;
  hourAtt: string;
  tarifaCategoria: string; // "" = manual
  tarifaRuta: string;
  value: string;
  tolls: string;
  recNocturno: boolean;
  recDominical: boolean;
  photo: boolean;
  approved: boolean;
  invoiced: boolean;
  notes: string;
  photoFiles: AdjuntoFile[];
  approvalFile: AdjuntoFile | null;
}

const sv = (v: NumLike): string => (v == null || v === "" ? "" : String(v));

/** Valor existente → { select, input libre } según esté o no en las opciones maestras. */
function setSelOrOtro(value: string, opciones: string[]): { sel: string; otro: string } {
  if (!value) return { sel: "", otro: "" };
  return opciones.includes(value) ? { sel: value, otro: "" } : { sel: OTRO, otro: value };
}

function conductoresDe(admin: AdminConfig | null): string[] {
  const set = new Set<string>();
  admin?.vehiculos.forEach((v) => { if (v.driver) set.add(v.driver); });
  admin?.personal.filter((p) => p.activo !== false).forEach((p) => { if (p.nombre) set.add(p.nombre); });
  return [...set];
}

function buildInit(args: {
  editing: Servicio | null;
  dup: Servicio | null;
  month: MonthInfo;
  admin: AdminConfig | null;
  tarifario: Tarifario | null;
}): { campos: Campos; nota: string | null; hint: string | null } {
  const { editing, dup, month, admin, tarifario } = args;
  const interventores = admin?.interventores ?? [];
  const areas = admin?.areas ?? [];
  const placas = (admin?.vehiculos ?? []).filter((v) => v.activo !== false).map((v) => v.plate);
  const equipos = (admin?.equipos ?? []).map((e) => e.name);
  const conductores = conductoresDe(admin);

  const base: Campos = {
    date: `${month.key}-01`, // día 1 del mes activo (SPEC §4.5)
    orderNo: "",
    serviceType: "Programado",
    interventorSel: "", interventorOtro: "",
    areaAAASel: "", areaAAAOtro: "",
    plateSel: "", plateOtro: "",
    driverSel: "", driverOtro: "", operario: "",
    equipmentSel: "", equipmentOtro: "",
    capacity: "", weight: "",
    pickup: "", destination: "", area: "",
    hourReq: "", hourAtt: "",
    tarifaCategoria: "", tarifaRuta: "",
    value: "", tolls: "",
    recNocturno: false, recDominical: false,
    photo: false, approved: false, invoiced: false,
    notes: "",
    photoFiles: [], approvalFile: null,
  };

  const src = editing ?? dup;
  let campos = base;
  if (src) {
    const si = setSelOrOtro(src.interventor || "", interventores);
    const sa = setSelOrOtro(areaAAADe(src), areas);
    const sp = setSelOrOtro(src.plate || "", placas);
    const sd = setSelOrOtro(src.driver || "", conductores);
    const se = setSelOrOtro(src.equipment || "", equipos);
    campos = {
      ...base,
      orderNo: src.orderNo ?? "",
      serviceType: String(src.serviceType || "Programado"),
      interventorSel: si.sel, interventorOtro: si.otro,
      areaAAASel: sa.sel, areaAAAOtro: sa.otro,
      plateSel: sp.sel, plateOtro: sp.otro,
      driverSel: sd.sel, driverOtro: sd.otro,
      operario: src.operario ?? "",
      equipmentSel: se.sel, equipmentOtro: se.otro,
      capacity: sv(src.capacity), weight: sv(src.weight),
      pickup: src.pickup ?? "", destination: src.destination ?? "", area: src.area ?? "",
      hourReq: src.hourReq ?? "", hourAtt: src.hourAtt ?? "",
      tarifaCategoria: src.tarifaCategoria ?? "", tarifaRuta: src.tarifaRuta ?? "",
      value: sv(src.value), tolls: sv(src.tolls),
      notes: src.notes ?? "",
    };
    if (editing) {
      // Edición: restaura fecha, checkboxes (incluidos los recargos persistidos), adjuntos.
      // (El duplicado NO los copia.)
      campos.date = editing.date;
      campos.recNocturno = !!editing.recargoNocturno;
      campos.recDominical = !!editing.recargoDominical;
      campos.photo = !!editing.photo;
      campos.approved = !!editing.approved;
      campos.invoiced = !!editing.invoiced;
      campos.photoFiles = editing.photoFiles ?? [];
      campos.approvalFile = editing.approvalFile ?? null;
    }
  }

  let nota: string | null = null;
  let hint: string | null = null;
  if (!editing) {
    // Registro nuevo o duplicado: recargos automáticos + recálculo del tarifario.
    const r = autoRecargos({
      date: campos.date, hourReq: campos.hourReq, hourAtt: campos.hourAtt,
      nocturnoActual: campos.recNocturno, dominicalActual: campos.recDominical,
      nocturnoTouched: false, dominicalTouched: false, admin,
    });
    campos.recNocturno = r.nocturno;
    campos.recDominical = r.dominical;
    nota = r.nota;
    if (tarifario) {
      const c = computeValor(tarifario, campos.tarifaCategoria || null, campos.tarifaRuta || null, campos.recNocturno, campos.recDominical);
      if (c) {
        campos.capacity = String(c.capacidad);
        if (c.total != null) campos.value = String(c.total);
        hint = c.hint;
      }
    }
  }
  return { campos, nota, hint };
}

// ── Componente ─────────────────────────────────────────────────────

/** Prefijo de las órdenes: TP (Transporte AAA) o AL (Contrato de Alquiler); las prefacturas usan PF. */
export const PREFIJO_ORDEN = "TP";
export const prefijoOrdenDe = (ns: string) => (ns === "alquiler" ? "AL" : PREFIJO_ORDEN);

/** Siguiente N° de orden consecutivo (TP0001, TP0002, …) considerando todos los meses cargados. */
export function siguienteOrden(servicesByMonth: Record<string, Servicio[]>, ns = "transporte"): string {
  return prefijoOrdenDe(ns) + siguienteNumero(servicesByMonth);
}
function siguienteNumero(servicesByMonth: Record<string, Servicio[]>): string {
  let max = 0;
  Object.values(servicesByMonth).forEach((arr) => (arr ?? []).forEach((s) => {
    const n = parseInt(String(s.orderNo ?? "").replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }));
  return String(max + 1).padStart(4, "0");
}

export function ServicioForm({
  t,
  month,
  editing,
  dupFrom,
  onClose,
  onSaved,
}: {
  t: UseTransporte;
  month: MonthInfo;
  editing: Servicio | null;
  dupFrom: Servicio | null;
  onClose: () => void;
  onSaved: (item: Servicio) => void;
}) {
  const ses = useTransporteSession();
  const admin = t.admin;
  const tarifario = t.tarifario;

  const [init] = useState(() => buildInit({ editing, dup: dupFrom, month, admin, tarifario }));
  // N° de orden automático y consecutivo (0001, 0002, …) sobre TODOS los meses;
  // al editar se conserva el existente.
  const [f, setF] = useState<Campos>(() => (editing ? init.campos : { ...init.campos, orderNo: siguienteOrden(t.servicesByMonth, t.ns) }));
  const [autoNota, setAutoNota] = useState<string | null>(init.nota);
  const [tarifaHint, setTarifaHint] = useState<string | null>(init.hint);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  // Flags touched: nuevos/duplicados arrancan false; edición arranca true (SPEC §4.2).
  const touchedRef = useRef({ noct: !!editing, dom: !!editing });

  // Cierre con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Rango de fechas del mes activo (min/max), sin pasar por UTC.
  const diasMes = new Date(month.year, month.month + 1, 0).getDate();
  const minDate = `${month.key}-01`;
  const maxDate = `${month.key}-${String(diasMes).padStart(2, "0")}`;

  // Listas maestras
  const vehiculosActivos = (admin?.vehiculos ?? []).filter((v) => v.activo !== false);
  const equipos = admin?.equipos ?? [];
  const designado = vehiculosActivos.find((v) => v.plate === f.plateSel)?.driver || "";
  const conductores = (() => {
    const rest = conductoresDe(admin).filter((d) => d !== designado).sort((a, b) => a.localeCompare(b, "es"));
    return designado ? [designado, ...rest] : rest;
  })();
  const catSel = tarifario?.categorias.find((c) => c.id === f.tarifaCategoria) ?? null;

  // ── Recálculos encadenados (handlers, no efectos) ────────────────

  /** Aplica computeValor sobre un estado candidato y actualiza el hint. */
  const esAlquiler = t.ns === "alquiler";
  /** Alquiler: unitario de la tarifa elegida (valor hora máquina o valor del viaje de transporte). */
  const tarifaSel = (c: Campos) => tarifario?.categorias.find((x) => x.id === c.tarifaCategoria)?.rutas.find((r) => r.id === c.tarifaRuta) ?? null;
  const esPorHora = (c: Campos) => { const r = tarifaSel(c); return !!r && /\(HR\)|hora/i.test(r.label); };
  const conValor = (next: Campos): Campos => {
    if (!tarifario) return next;
    if (esAlquiler) {
      const r = tarifaSel(next);
      if (!r) { setTarifaHint(null); return next; }
      const unit = num(r.unitario);
      const horas = respHours(next.hourReq, next.hourAtt);
      if (esPorHora(next)) {
        if (horas == null) { setTarifaHint(`Valor hora máquina: ${fmtCOP(unit)} — indica hora solicitada y atendida para calcular las horas.`); return { ...next, tolls: "0" }; }
        const total = Math.round(unit * horas);
        setTarifaHint(`${horas} h × ${fmtCOP(unit)} (hora máquina) = ${fmtCOP(total)}`);
        return { ...next, value: String(total), tolls: "0" };
      }
      setTarifaHint(`Transporte del equipo: ${fmtCOP(unit)} por viaje`);
      return { ...next, value: String(unit), tolls: "0" };
    }
    const c = computeValor(tarifario, next.tarifaCategoria || null, next.tarifaRuta || null, next.recNocturno, next.recDominical);
    if (!c) { setTarifaHint(null); return next; }
    const out = { ...next, capacity: String(c.capacidad) };
    if (c.total != null) { out.value = String(c.total); setTarifaHint(c.hint); } else setTarifaHint(null);
    return out;
  };

  /** Cambio de fecha u horas: evalúa recargos automáticos y recalcula el valor. */
  const cambiaTiempo = (patch: Partial<Campos>) => {
    let next = { ...f, ...patch };
    const r = autoRecargos({
      date: next.date, hourReq: next.hourReq, hourAtt: next.hourAtt,
      nocturnoActual: next.recNocturno, dominicalActual: next.recDominical,
      nocturnoTouched: touchedRef.current.noct, dominicalTouched: touchedRef.current.dom,
      admin,
    });
    next = { ...next, recNocturno: r.nocturno, recDominical: r.dominical };
    setAutoNota(r.nota);
    setF(conValor(next));
  };

  const cambiaRecargo = (kind: "noct" | "dom", val: boolean) => {
    touchedRef.current[kind] = true; // el ajuste manual prevalece
    setAutoNota(null);
    setF(conValor({ ...f, [kind === "noct" ? "recNocturno" : "recDominical"]: val }));
  };

  const cambiaCategoria = (catId: string) => setF(conValor({ ...f, tarifaCategoria: catId, tarifaRuta: "" }));
  const cambiaRuta = (rutaId: string) => setF(conValor({ ...f, tarifaRuta: rutaId }));

  const cambiaPlaca = (v: string) => {
    const next = { ...f, plateSel: v };
    if (v && v !== OTRO) {
      const veh = vehiculosActivos.find((x) => x.plate === v);
      if (veh) {
        next.capacity = sv(veh.capacity);
        if (veh.driver) { next.driverSel = veh.driver; next.driverOtro = ""; }
      }
    }
    setF(next);
  };

  const cambiaEquipo = (v: string) => {
    const next = { ...f, equipmentSel: v };
    if (v && v !== OTRO) {
      const eq = equipos.find((x) => x.name === v);
      if (eq) next.weight = sv(eq.weight);
    }
    setF(next);
  };

  // ── Adjuntos ─────────────────────────────────────────────────────

  const agregarEvidencias = async (files: FileList | null) => {
    if (!files?.length) return;
    const warns: string[] = [];
    const nuevos: AdjuntoFile[] = [];
    for (const file of Array.from(files)) {
      try {
        const r = await processSelectedFile(file);
        nuevos.push(r.file);
        if (r.warning) warns.push(r.warning);
      } catch (e) {
        warns.push(e instanceof Error ? e.message : `No se pudo adjuntar "${file.name}".`);
      }
    }
    setAvisos(warns);
    if (nuevos.length) {
      setF((prev) => ({ ...prev, photoFiles: [...prev.photoFiles, ...nuevos], photo: true }));
    }
  };

  const agregarVoBo = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const r = await processSelectedFile(file);
      setAvisos(r.warning ? [r.warning] : []);
      setF((prev) => ({ ...prev, approvalFile: r.file, approved: true }));
    } catch (e) {
      setAvisos([e instanceof Error ? e.message : `No se pudo adjuntar "${file.name}".`]);
    }
  };

  const quitarEvidencia = (idx: number) =>
    setF((prev) => ({ ...prev, photoFiles: prev.photoFiles.filter((_, i) => i !== idx) }));

  // ── Guardado con aprobación (SPEC §4.4) ──────────────────────────

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.date) { setError("La fecha del servicio es obligatoria."); return; }
    const r = ses.approve(); // sella con el rol de la sesión de plataforma (sin clave)

    const resolver = (sel: string, otro: string) => (sel === OTRO ? otro.trim() : sel);
    const manual = !f.tarifaCategoria || f.tarifaCategoria === "manual";
    const item: Servicio = {
      id: editing?.id ?? nuevoServicioId(),
      date: f.date,
      orderNo: editing ? f.orderNo.trim() : siguienteOrden(t.servicesByMonth, t.ns),
      serviceType: f.serviceType,
      interventor: resolver(f.interventorSel, f.interventorOtro),
      areaAAA: resolver(f.areaAAASel, f.areaAAAOtro),
      plate: resolver(f.plateSel, f.plateOtro),
      capacity: f.capacity,
      driver: resolver(f.driverSel, f.driverOtro),
      operario: f.operario.trim(),
      equipment: resolver(f.equipmentSel, f.equipmentOtro),
      weight: f.weight,
      pickup: f.pickup.trim(),
      destination: f.destination.trim(),
      area: f.area.trim(),
      hourReq: f.hourReq,
      hourAtt: f.hourAtt,
      value: f.value,
      tolls: esAlquiler ? "0" : f.tolls,
      horasMaquina: esAlquiler ? (respHours(f.hourReq, f.hourAtt) ?? "") : undefined,
      valorHora: esAlquiler && esPorHora(f) ? String(num(tarifaSel(f)?.unitario ?? 0)) : undefined,
      photo: f.photo,
      approved: f.approved,
      invoiced: f.invoiced,
      recargoNocturno: f.recNocturno,
      recargoDominical: f.recDominical,
      notes: f.notes.trim(),
      photoFiles: f.photoFiles,
      approvalFile: f.approvalFile,
      tarifaCategoria: manual ? null : f.tarifaCategoria,
      tarifaRuta: manual ? null : f.tarifaRuta || null,
      ...r.stamp, // approvedBy / approvedByKey / approvedAt (siempre se re-aprueba)
    };

    setGuardando(true);
    try {
      await t.upsertService(month.key, item);
      onSaved(item);
    } catch (err) {
      // El hook ya revirtió; el drawer queda abierto con los datos para corregir.
      setError(err instanceof Error ? err.message : "No se pudo guardar el servicio.");
    } finally {
      setGuardando(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────

  const gridAuto: React.CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" };
  const seccion = (titulo: string) => (
    <div className="section-title" style={{ margin: "16px 0 8px" }}>{titulo}</div>
  );

  const selectMaestro = (
    etiqueta: string,
    sel: string,
    otro: string,
    opciones: Array<{ value: string; label: string }>,
    labelOtro: string,
    onSel: (v: string) => void,
    onOtro: (v: string) => void,
    placeholderOtro: string,
  ) => (
    <label className="field">{etiqueta}
      <select value={sel} onChange={(e) => onSel(e.target.value)}>
        <option value="">— Selecciona —</option>
        {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value={OTRO}>{labelOtro}</option>
      </select>
      {sel === OTRO && (
        <input className="input" value={otro} onChange={(e) => onOtro(e.target.value)} placeholder={placeholderOtro} />
      )}
    </label>
  );

  const recNoct = fmtCOP(num(tarifario?.recargos.nocturno));
  const recDom = fmtCOP(num(tarifario?.recargos.dominicalFestivo));
  const titulo = editing ? "Editar servicio" : "Registrar servicio";
  const subtitulo = month.label + (dupFrom ? " · Duplicado — revisa fecha, horas y evidencia" : "");

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="drawer-title">{titulo}</h2>
            <span className="cc-dias">{subtitulo}</span>
          </div>
          <button className="drawer-close" onClick={onClose} title="Cerrar (Esc)">×</button>
        </div>
        <div className="drawer-body">
          <form onSubmit={guardar} style={{ display: "grid", gap: 4 }}>
            {seccion("Servicio")}
            <div style={gridAuto}>
              <label className="field">Fecha del servicio *
                <input className="input" required type="date" min={minDate} max={maxDate} value={f.date}
                  onChange={(e) => cambiaTiempo({ date: e.target.value })} />
              </label>
              <label className="field">N° Orden / Remisión
                <input className="input" value={f.orderNo} readOnly={!editing} title={editing ? "" : "Se asigna automáticamente de forma consecutiva"}
                  style={editing ? undefined : { background: "var(--surface-2)", color: "var(--text-2)" }}
                  onChange={(e) => setF({ ...f, orderNo: e.target.value })} />
              </label>
              <label className="field">Tipo de servicio
                <select value={f.serviceType} onChange={(e) => setF({ ...f, serviceType: e.target.value })}>
                  {TIPOS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              {selectMaestro(
                "Interventor / Funcionario Triple A", f.interventorSel, f.interventorOtro,
                (admin?.interventores ?? []).map((x) => ({ value: x, label: x })),
                "Otro (digitar)",
                (v) => setF({ ...f, interventorSel: v }),
                (v) => setF({ ...f, interventorOtro: v }),
                "Nombre del interventor",
              )}
              {selectMaestro(
                "Área AAA solicitante", f.areaAAASel, f.areaAAAOtro,
                (admin?.areas ?? []).map((x) => ({ value: x, label: x })),
                "Otra (digitar)",
                (v) => setF({ ...f, areaAAASel: v }),
                (v) => setF({ ...f, areaAAAOtro: v }),
                "Área solicitante",
              )}
            </div>

            {seccion(esAlquiler ? "Tarifa del contrato (equipo y zona — calcula el valor automáticamente)" : "Tarifa del pliego (opcional — calcula el valor automáticamente)")}
            <div style={gridAuto}>
              <label className="field">Categoría del tarifario
                <select value={f.tarifaCategoria} onChange={(e) => cambiaCategoria(e.target.value)}>
                  <option value="">Tarifa manual (digitar el valor)</option>
                  {(tarifario?.categorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              {catSel && (
                <label className="field">Ruta del pliego
                  <select value={f.tarifaRuta} onChange={(e) => cambiaRuta(e.target.value)}>
                    <option value="">— Selecciona la ruta —</option>
                    {catSel.rutas.map((rt) => (
                      <option key={rt.id} value={rt.id}>{rt.id} · {rt.label} — {fmtCOP(num(rt.unitario))}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {tarifaHint && <div className="muted" style={{ fontSize: 12.5 }}>{tarifaHint}</div>}
            {!esAlquiler && <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px", marginTop: 6 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                <input type="checkbox" checked={f.recNocturno} onChange={(e) => cambiaRecargo("noct", e.target.checked)} />
                Recargo nocturno (+{recNoct})
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                <input type="checkbox" checked={f.recDominical} onChange={(e) => cambiaRecargo("dom", e.target.checked)} />
                Recargo dominical/festivo (+{recDom})
              </label>
            </div>}
            {!esAlquiler && autoNota && <div style={{ color: "var(--warn)", fontSize: 12.5 }}>{autoNota}</div>}

            {seccion("Vehículo y carga")}
            <div style={gridAuto}>
              {selectMaestro(
                "Placa del vehículo", f.plateSel, f.plateOtro,
                vehiculosActivos.map((v) => ({ value: v.plate, label: `${v.plate} · ${num(v.capacity)} T · ${v.driver || "sin conductor"}` })),
                "Otra placa (digitar)",
                cambiaPlaca,
                (v) => setF({ ...f, plateOtro: v.toUpperCase() }),
                "ABC-123",
              )}
              <label className="field">Capacidad del vehículo (Ton)
                <input className="input num" type="number" step="0.1" min="0" value={f.capacity}
                  onChange={(e) => setF({ ...f, capacity: e.target.value })} />
              </label>
              {selectMaestro(
                "Conductor", f.driverSel, f.driverOtro,
                conductores.map((d) => ({ value: d, label: d === designado ? `${d} (designado)` : d })),
                "Otro conductor (digitar)",
                (v) => setF({ ...f, driverSel: v }),
                (v) => setF({ ...f, driverOtro: v }),
                "Nombre del conductor",
              )}
              {selectMaestro(
                "Equipo / máquina transportada", f.equipmentSel, f.equipmentOtro,
                equipos.map((eq) => ({ value: eq.name, label: `${eq.name} · ${eq.clase || "equipo"} · ${num(eq.weight)} T` })),
                "Otro equipo (digitar)",
                cambiaEquipo,
                (v) => setF({ ...f, equipmentOtro: v }),
                "Equipo transportado",
              )}
              <label className="field">Peso del equipo (Ton)
                <input className="input num" type="number" step="0.01" min="0" value={f.weight}
                  onChange={(e) => setF({ ...f, weight: e.target.value })} />
              </label>
              <label className="field">Nombre del operario
                <input className="input" value={f.operario} placeholder="Operario del equipo"
                  onChange={(e) => setF({ ...f, operario: e.target.value })} />
              </label>
            </div>

            {seccion("Ruta")}
            <div style={gridAuto}>
              <label className="field">Lugar de recogida
                <input className="input" value={f.pickup} onChange={(e) => setF({ ...f, pickup: e.target.value })} />
              </label>
              <label className="field">Lugar de destino
                <input className="input" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} />
              </label>
              <label className="field">Municipio / área de prestación
                <input className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />
              </label>
            </div>

            {seccion("Tiempos de atención")}
            <div style={gridAuto}>
              <label className="field">Hora solicitada
                <input className="input" type="time" value={f.hourReq} onChange={(e) => cambiaTiempo({ hourReq: e.target.value })} />
              </label>
              <label className="field">Hora atendida
                <input className="input" type="time" value={f.hourAtt} onChange={(e) => cambiaTiempo({ hourAtt: e.target.value })} />
              </label>
              <label className="field">{esAlquiler ? "Horas máquina (solicitada → atendida)" : "Tiempo de respuesta"}
                <input className="input num" readOnly value={(() => { const h = respHours(f.hourReq, f.hourAtt); if (h == null) return ""; const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${h} h (${hh}:${String(mm).padStart(2, "0")})`; })()} style={{ background: "var(--surface-2)", color: "var(--text-2)" }} />
              </label>
            </div>

            {seccion("Financiero")}
            <div style={gridAuto}>
              {esAlquiler && (
                <label className="field">Valor hora máquina (COP) <span className="muted" style={{ fontWeight: 400 }}>· del tarifario</span>
                  <input className="input num" readOnly value={tarifaSel(f) ? (esPorHora(f) ? fmtCOP(num(tarifaSel(f)!.unitario)) : `${fmtCOP(num(tarifaSel(f)!.unitario))} / viaje`) : "Selecciona equipo y zona"}
                    style={{ background: "var(--surface-2)", color: "var(--text-2)" }} />
                </label>
              )}
              <label className="field">Valor del servicio (COP){esAlquiler && tarifaSel(f) && <span className="muted" style={{ fontWeight: 400 }}> · calculado</span>}
                <input className="input num" type="number" step="1" min="0" value={f.value}
                  onChange={(e) => setF({ ...f, value: e.target.value })} />
              </label>
              {!esAlquiler && (
                <label className="field">Peajes (COP)
                  <input className="input num" type="number" step="1" min="0" value={f.tolls}
                    onChange={(e) => setF({ ...f, tolls: e.target.value })} />
                </label>
              )}
            </div>

            {seccion("Evidencia fotográfica y soportes")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                <input type="checkbox" checked={f.photo} onChange={(e) => setF({ ...f, photo: e.target.checked })} />
                Hay evidencia fotográfica
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                <input type="checkbox" checked={f.approved} onChange={(e) => setF({ ...f, approved: e.target.checked })} />
                V°B° del interventor
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                <input type="checkbox" checked={f.invoiced} onChange={(e) => setF({ ...f, invoiced: e.target.checked })} />
                Ya facturado en el sistema contable
              </label>
            </div>
            <div style={gridAuto}>
              <label className="field">Evidencias (fotos / PDF)
                <input className="input" type="file" multiple accept="image/*,application/pdf"
                  onChange={(e) => { void agregarEvidencias(e.target.files); e.target.value = ""; }} />
              </label>
              <label className="field">V°B° del interventor (archivo)
                <input className="input" type="file" accept="image/*,application/pdf"
                  onChange={(e) => { void agregarVoBo(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Las fotos se comprimen automáticamente. Evita adjuntar PDF muy pesados (más de 3 MB).
            </div>
            {(f.photoFiles.length > 0 || f.approvalFile) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {f.photoFiles.map((file, i) => (
                  <span key={`${file.name}-${i}`} className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                    <button type="button" onClick={() => openAttachment(file)}
                      style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", font: "inherit", padding: 0 }}
                      title={`Abrir ${file.name}`}>
                      {file.name.length > 22 ? file.name.slice(0, 20) + "…" : file.name}
                    </button>
                    <button type="button" onClick={() => quitarEvidencia(i)} title="Quitar adjunto"
                      style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", fontWeight: 700, padding: 0 }}>×</button>
                  </span>
                ))}
                {f.approvalFile && (
                  <span className="badge ok">
                    <button type="button" onClick={() => f.approvalFile && openAttachment(f.approvalFile)}
                      style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", font: "inherit", padding: 0 }}
                      title={`Abrir ${f.approvalFile.name}`}>
                      V°B°: {f.approvalFile.name.length > 18 ? f.approvalFile.name.slice(0, 16) + "…" : f.approvalFile.name}
                    </button>
                    <button type="button" onClick={() => setF({ ...f, approvalFile: null })} title="Quitar V°B°"
                      style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", fontWeight: 700, padding: 0 }}>×</button>
                  </span>
                )}
              </div>
            )}
            {avisos.map((w, i) => <div key={i} style={{ color: "var(--warn)", fontSize: 12.5 }}>{w}</div>)}

            {seccion("Observaciones")}
            <textarea className="input" rows={3} value={f.notes}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
              placeholder="Notas del servicio (opcional)" style={{ resize: "vertical" }} />

            {seccion("Registro del servicio")}
            {editing && aprobadorDe(editing) && (
              <div className="muted" style={{ fontSize: 12.5 }}>
                Último registro aprobado por {aprobadorDe(editing)} el {editing.approvedAt ? new Date(editing.approvedAt).toLocaleString("es-CO") : "—"}.
                Al guardar se sellará de nuevo con el perfil activo.
              </div>
            )}
            <div style={{ fontSize: 13, color: "var(--text-2)" }}>
              Se registrará como: <b>{ses.profileLabel(ses.currentProfile)}</b> (rol de tu sesión en la plataforma).
            </div>

            {error && <div style={{ color: "var(--high)", fontSize: 13, marginTop: 6 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={guardando}>
                {guardando ? "Guardando…" : editing ? "Guardar cambios" : "Guardar servicio"}
              </button>
            </div>
            {f.date && (
              <div className="muted" style={{ fontSize: 12, textAlign: "right" }}>
                Servicio del {fdate(f.date)} en {month.label}.
              </div>
            )}
          </form>
        </div>
      </aside>
    </>
  );
}
