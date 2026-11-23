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

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { UseTransporte } from "@/lib/transporte/useTransporte";
import type { AdjuntoFile, AdminConfig, MonthInfo, NumLike, Servicio, Tarifario } from "@/lib/transporte/model";
import { areaAAADe, aprobadorDe, num, nuevoServicioId } from "@/lib/transporte/model";
import { ACTIVIDADES_RECOLECCION, AREAS_RECOLECCION, DESTINO_RECOLECCION, esModuloBase, FICHA_MODULO, MAX_AYUDANTES_RECOLECCION, servicioRecoleccionDe, zonaDeRuta } from "@/lib/transporte/constants";
import { autoRecargos, computeValor, costoCalculado, fdate, fmtCOP, respHours, sugerenciasCampo } from "@/lib/transporte/logic";
import { openAttachment, processSelectedFile, subirAdjunto } from "@/lib/transporte/media";
import { useTransporteSession } from "@/lib/transporte/session";
import { ConfirmarEliminacion } from "@/app/components/ConfirmarEliminacion";
import { MontoAyuda } from "@/app/components/MontoAyuda";

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
  transporteEquipo: boolean;
  viajesEquipo: string;
  horasMaquina: string;
  ivaAlquiler: boolean;
  ivaTransporte: boolean;
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
  // Contrato de Recolección — Planilla de Despacho de Equipos
  planilla: string;
  numeroInterno: string;
  ruta: string;
  actividad: string;
  horaSalida: string;
  horaRetorno: string;
  horometroInicial: string;
  horometroFinal: string;
  ayudantes: string[];
  /** Recolección: valor por hora sin IVA cuando el servicio no tiene tarifa en el Tarifario. */
  valorHoraManual: string;
}

/** Fecha inicial de un registro nuevo: hoy si cae en el mes activo; si no, el día 1 del mes. */
function fechaInicial(mesKey: string): string {
  const hoy = new Date();
  const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  return iso.startsWith(`${mesKey}-`) ? iso : `${mesKey}-01`;
}

/** Campos que pueden marcarse con error al guardar (se muestran junto al campo). */
type CampoError = "date" | "tarifaCategoria" | "tarifaRuta" | "equipmentOtro" | "valorHoraManual" | "horometroFinal" | "horasMaquina";
/** Orden en el formulario: el foco va al primero con error. */
const ORDEN_ERRORES: CampoError[] = ["date", "tarifaCategoria", "tarifaRuta", "equipmentOtro", "valorHoraManual", "horometroFinal", "horasMaquina"];

/** Recolección: opción «sin tarifa en el tarifario» del selector de volqueta o servicio. */
const SIN_TARIFA = "manual";

/** Recolección: áreas AAA = tipos de servicio del contrato + las de Administración. */
function areasRecoleccion(admin: AdminConfig | null): string[] {
  return [...new Set([...AREAS_RECOLECCION, ...(admin?.areas ?? [])])];
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
  // Los ayudantes (Contrato de Recolección) no conducen: no se ofrecen como conductores.
  admin?.personal.filter((p) => p.activo !== false && p.rol !== "ayudante").forEach((p) => { if (p.nombre) set.add(p.nombre); });
  return [...set];
}

/** Recolección: ayudantes activos del catálogo de Personal. */
function ayudantesDe(admin: AdminConfig | null): string[] {
  return (admin?.personal ?? []).filter((p) => p.activo !== false && p.rol === "ayudante" && p.nombre).map((p) => p.nombre);
}

function buildInit(args: {
  editing: Servicio | null;
  dup: Servicio | null;
  month: MonthInfo;
  admin: AdminConfig | null;
  tarifario: Tarifario | null;
  esRecoleccion: boolean;
}): { campos: Campos; nota: string | null; hint: string | null } {
  const { editing, dup, month, admin, tarifario, esRecoleccion } = args;
  const interventores = admin?.interventores ?? [];
  const areas = esRecoleccion ? areasRecoleccion(admin) : admin?.areas ?? [];
  const placas = (admin?.vehiculos ?? []).filter((v) => v.activo !== false).map((v) => v.plate);
  const equipos = (admin?.equipos ?? []).map((e) => e.name);
  const conductores = conductoresDe(admin);

  const base: Campos = {
    date: fechaInicial(month.key), // hoy si cae en el mes activo; si no, el día 1
    orderNo: "",
    serviceType: "Programado",
    interventorSel: "", interventorOtro: "",
    areaAAASel: "", areaAAAOtro: "",
    plateSel: "", plateOtro: "",
    driverSel: "", driverOtro: "", operario: "", transporteEquipo: false, viajesEquipo: "0", horasMaquina: "", ivaAlquiler: true, ivaTransporte: false, // formulario de precios: el transporte del equipo no grava IVA
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
    planilla: "", numeroInterno: "", ruta: "", actividad: "",
    horaSalida: "", horaRetorno: "", horometroInicial: "", horometroFinal: "",
    ayudantes: [],
    valorHoraManual: "",
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
      transporteEquipo: !!src.transporteEquipo,
      viajesEquipo: String(src.viajesEquipo ?? (src.transporteEquipo ? 1 : 0)),
      horasMaquina: src.horasMaquina != null && src.horasMaquina !== "" ? String(src.horasMaquina) : "",
      ivaAlquiler: src.ivaAlquiler ?? true,
      ivaTransporte: src.ivaTransporte ?? true,
      equipmentSel: se.sel, equipmentOtro: se.otro,
      capacity: sv(src.capacity), weight: sv(src.weight),
      pickup: src.pickup ?? "", destination: src.destination ?? "", area: src.area ?? "",
      hourReq: src.hourReq ?? "", hourAtt: src.hourAtt ?? "",
      tarifaCategoria: src.tarifaCategoria ?? "", tarifaRuta: src.tarifaRuta ?? "",
      value: sv(src.value), tolls: sv(src.tolls),
      notes: src.notes ?? "",
      // Recolección: el duplicado conserva vehículo, ruta y actividad; la planilla,
      // las horas y el horómetro son propios de cada servicio.
      numeroInterno: src.numeroInterno ?? "",
      ruta: src.ruta ?? "",
      actividad: src.actividad ?? "",
      ayudantes: src.ayudantes ?? [],
    };
    // Recolección sin tarifa del tarifario: el valor hora quedó guardado en el registro.
    if (esRecoleccion && !src.tarifaCategoria && num(src.valorHora) > 0) {
      campos.tarifaCategoria = SIN_TARIFA;
      campos.valorHoraManual = String(num(src.valorHora));
    }
    // Recolección: el precio del contrato incluye IVA, así que el servicio siempre lleva IVA 19%.
    if (esRecoleccion) campos.ivaAlquiler = true;
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
      campos.planilla = editing.planilla ?? "";
      campos.horaSalida = editing.horaSalida ?? "";
      campos.horaRetorno = editing.horaRetorno ?? "";
      campos.horometroInicial = sv(editing.horometroInicial);
      campos.horometroFinal = sv(editing.horometroFinal);
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
/** Prefijo de órdenes de un módulo base (los contratos creados en la app traen el suyo en t.ficha). */
export const prefijoOrdenDe = (ns: string) => (esModuloBase(ns) ? FICHA_MODULO[ns].prefijoOrden : PREFIJO_ORDEN);

/** Siguiente N° de orden consecutivo (TP0001, TP0002, …) considerando todos los meses cargados. */
export function siguienteOrden(servicesByMonth: Record<string, Servicio[]>, prefijo = PREFIJO_ORDEN): string {
  return prefijo + siguienteNumero(servicesByMonth);
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

  const [init] = useState(() => buildInit({ editing, dup: dupFrom, month, admin, tarifario, esRecoleccion: t.ns === "recoleccion" }));
  // N° de orden automático y consecutivo (0001, 0002, …) sobre TODOS los meses;
  // al editar se conserva el existente.
  const [f, setF] = useState<Campos>(() => (editing ? init.campos : { ...init.campos, orderNo: siguienteOrden(t.servicesByMonth, t.ficha.prefijoOrden) }));
  const [autoNota, setAutoNota] = useState<string | null>(init.nota);
  const [tarifaHint, setTarifaHint] = useState<string | null>(init.hint);
  const [error, setError] = useState<string | null>(null);
  // Errores por campo: se muestran debajo de cada uno y se borran al corregirlo.
  const [errores, setErrores] = useState<Partial<Record<CampoError, string>>>({});
  const previoRef = useRef<Campos | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  // Transporte AAA — costo a contratistas (USO INTERNO, nunca en PDF ni exportaciones).
  // Vacío = automático (tarifa de costo de la ruta + recargos); con valor = fijado a mano.
  // Al editar, un costo guardado distinto del calculado hoy se conserva (quedó fijado al registrar).
  const esTransporte = t.ns === "transporte";
  const [costoTxt, setCostoTxt] = useState<string>(() => {
    if (!editing || editing.costoContratista == null || String(editing.costoContratista).trim() === "") return "";
    const calc = costoCalculado(editing, t.tarifario, t.tarifarioCosto);
    return calc !== null && calc === num(editing.costoContratista) ? "" : String(editing.costoContratista);
  });
  const costoAuto = esTransporte
    ? costoCalculado({ tarifaCategoria: f.tarifaCategoria || null, tarifaRuta: f.tarifaRuta || null, value: f.value, recargoNocturno: f.recNocturno, recargoDominical: f.recDominical } as Servicio, t.tarifario, t.tarifarioCosto)
    : null;
  const costoFinal = costoTxt.trim() !== "" ? num(costoTxt) : costoAuto;
  // Flags touched: nuevos/duplicados arrancan false; edición arranca true (SPEC §4.2).
  const touchedRef = useRef({ noct: !!editing, dom: !!editing });

  // Cambios sin guardar: se compara con el estado con que abrió el formulario.
  const inicialRef = useRef<string | null>(null);
  const instantanea = JSON.stringify([f, costoTxt]);
  if (inicialRef.current === null) inicialRef.current = instantanea;
  const hayCambios = instantanea !== inicialRef.current;
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  /** Cerrar (×, Cancelar, clic afuera o Esc): si hay datos sin guardar, se pide confirmar antes de perderlos. */
  const intentarCerrar = () => {
    if (guardando) return;
    if (hayCambios) setConfirmarCierre(true);
    else onClose();
  };
  const cerrarRef = useRef(intentarCerrar);
  cerrarRef.current = intentarCerrar;

  // Cierre con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Al corregir un campo con error, su mensaje desaparece.
  useEffect(() => {
    const previo = previoRef.current;
    previoRef.current = f;
    if (!previo) return;
    setErrores((errs) => {
      const claves = Object.keys(errs) as CampoError[];
      const siguen = claves.filter((k) => previo[k] === f[k]);
      return siguen.length === claves.length ? errs : Object.fromEntries(siguen.map((k) => [k, errs[k]])) as Partial<Record<CampoError, string>>;
    });
  }, [f]);

  /** Atributos de accesibilidad de un campo que puede tener error. */
  const campoProps = (k: CampoError) => ({
    id: `campo-${k}`,
    "aria-invalid": errores[k] ? true : undefined,
    "aria-describedby": errores[k] ? `error-${k}` : undefined,
  });
  const errorDe = (k: CampoError) => (errores[k] ? <span id={`error-${k}`} className="campo-error">{errores[k]}</span> : null);

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

  // Autocompletado de los campos de texto libre con lo ya registrado (SPEC §5.2):
  // recogida y destino comparten el universo de sitios, porque un mismo lugar se
  // repite en ambos sentidos. Se recalcula solo cuando cambian los servicios.
  const sugSitios = useMemo(() => sugerenciasCampo(t.servicesByMonth, ["pickup", "destination"]), [t.servicesByMonth]);
  const sugAreas = useMemo(() => sugerenciasCampo(t.servicesByMonth, "area"), [t.servicesByMonth]);
  const sugAyudantes = useMemo(
    () => [...new Set([...ayudantesDe(admin), ...Object.values(t.servicesByMonth).flat().flatMap((sv) => sv.ayudantes ?? [])])].filter(Boolean).sort((a, b) => a.localeCompare(b, "es")),
    [t.servicesByMonth, admin],
  );
  const sugRutas = useMemo(() => sugerenciasCampo(t.servicesByMonth, "ruta"), [t.servicesByMonth]);
  const sugInternos = useMemo(() => sugerenciasCampo(t.servicesByMonth, "numeroInterno"), [t.servicesByMonth]);
  const sugOperarios = useMemo(
    () => sugerenciasCampo(t.servicesByMonth, "operario", conductoresDe(admin)),
    [t.servicesByMonth, admin],
  );

  // ── Recálculos encadenados (handlers, no efectos) ────────────────

  /** Aplica computeValor sobre un estado candidato y actualiza el hint. */
  // Alquiler y Otro Sí / Emergencia se cobran por hora (horas × valor hora de la zona).
  const esEmergencia = t.ns === "emergencia";
  // Contrato de Recolección: volquetas por horas efectivas (horómetro) y tipo de servicio.
  const esRecoleccion = t.ns === "recoleccion";
  /** Emergencia y Recolección se registran por volqueta (placa + conductor), sin transporte del equipo. */
  const esVolqueta = esEmergencia || esRecoleccion;
  // Contratos creados en la app: misma estructura que Contrato de Alquiler.
  const esAlquiler = t.ns === "alquiler" || esVolqueta || !!t.ficha.dinamico;
  const etiquetaZona = (label: string) => (esVolqueta ? label.replace(/\s*\(HR\)\s*$/i, "") : zonaDe(label));
  const esApp = !!t.ficha.dinamico;
  /** Alquiler: unitario de la tarifa elegida (valor hora máquina o valor del viaje de transporte). */
  const tarifaSel = (c: Campos) => tarifario?.categorias.find((x) => x.id === c.tarifaCategoria)?.rutas.find((r) => r.id === c.tarifaRuta) ?? null;
  const esPorHora = (c: Campos) => { const r = tarifaSel(c); return !!r && /\(HR\)|hora/i.test(r.label); };
  /** Alquiler: la "ruta" guardada es la tarifa POR HORA de la zona; la de transporte se deriva por zona. */
  const zonaDe = (label: string) => (esApp ? zonaDeRuta(label, t.ns) : /municipio/i.test(label) ? "Municipios" : "Barranquilla y área metropolitana");
  const rutasHora = (c: Campos) => (tarifario?.categorias.find((x) => x.id === c.tarifaCategoria)?.rutas ?? []).filter((r) => /\(HR\)|hora/i.test(r.label));
  const tarifaTransporte = (c: Campos) => { const h = tarifaSel(c); if (!h) return null; const z = zonaDe(h.label); return (tarifario?.categorias.find((x) => x.id === c.tarifaCategoria)?.rutas ?? []).find((r) => /transporte/i.test(r.label) && zonaDe(r.label) === z) ?? null; };
  /** Alquiler: bases e IVA por ítem (19% activable en alquiler y en transporte). */
  /** Recolección: el servicio no tiene tarifa en el tarifario y se digita su valor por hora. */
  const sinTarifaRec = (c: Campos) => esRecoleccion && c.tarifaCategoria === SIN_TARIFA;
  const ivaDe = (c: Campos) => {
    const r = tarifaSel(c); const unit = r ? num(r.unitario) : sinTarifaRec(c) ? num(c.valorHoraManual) : 0;
    const horas = c.horasMaquina.trim() === "" ? 0 : num(c.horasMaquina);
    const viajes = Math.max(0, Math.floor(num(c.viajesEquipo)));
    const tr = tarifaTransporte(c); const vViaje = tr ? num(tr.unitario) : 0;
    const alq = Math.round(unit * horas), trans = vViaje * viajes;
    const ivaAlq = c.ivaAlquiler ? Math.round(alq * 0.19) : 0, ivaTr = c.ivaTransporte ? Math.round(trans * 0.19) : 0;
    return { unit, horas, viajes, vViaje, alq, trans, ivaAlq, ivaTr, total: ivaAlq + ivaTr, tr: !!tr };
  };
  const conValor = (next: Campos): Campos => {
    if (!tarifario) return next;
    if (esAlquiler) {
      const r = tarifaSel(next);
      const manualRec = sinTarifaRec(next);
      if (!r && !manualRec) { setTarifaHint(null); return next; }
      const unit = r ? num(r.unitario) : num(next.valorHoraManual);
      if (esRecoleccion && !(unit > 0)) {
        setTarifaHint(manualRec
          ? "Digita el valor por hora sin IVA para calcular el valor del servicio."
          : "Esta tarifa aún no tiene precio. Regístralo en la pestaña Tarifario, o elige «Sin tarifa en el tarifario» y digita el valor por hora.");
        return { ...next, value: "", tolls: "0" };
      }
      const horas = next.horasMaquina.trim() === "" ? null : num(next.horasMaquina);
      const viajes = Math.max(0, Math.floor(num(next.viajesEquipo)));
      const tr = viajes > 0 ? tarifaTransporte(next) : null;
      const vTr = tr ? num(tr.unitario) * viajes : 0;
      const txTr = tr ? ` + ${viajes} viaje(s) × ${fmtCOP(num(tr.unitario))} (transporte del equipo) = ${fmtCOP(vTr)}` : "";
      if (horas == null) {
        setTarifaHint(esVolqueta ? `Valor hora sin IVA: ${fmtCOP(unit)} — indica las horas efectivas de la volqueta${esRecoleccion ? " (horómetro final − inicial)" : ""}.` : `Valor hora máquina: ${fmtCOP(unit)}${txTr} — indica las horas máquina usadas para calcular el alquiler.`);
        return { ...next, value: tr ? String(vTr) : next.value, tolls: "0", transporteEquipo: viajes > 0 };
      }
      const alq = Math.round(unit * horas);
      const total = alq + vTr;
      setTarifaHint(`${horas} h × ${fmtCOP(unit)} (${esVolqueta ? "hora sin IVA" : "hora máquina"}) = ${fmtCOP(alq)}${txTr}${tr ? ` → total ${fmtCOP(total)}` : ""}`);
      return { ...next, value: String(total), tolls: "0", transporteEquipo: viajes > 0 };
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
  /** Recolección: valor por hora digitado (servicio sin tarifa en el tarifario). */
  const cambiaValorHoraManual = (v: string) => setF(conValor({ ...f, valorHoraManual: v }));
  const cambiaRuta = (rutaId: string) => {
    const next = { ...f, tarifaRuta: rutaId };
    // Recolección: el tipo de servicio de la tarifa ES el área AAA solicitante
    // (Recolección y Transporte / Servicios Especiales B2B y B2G).
    // Solo se llena cuando el tipo de servicio corresponde a un área conocida; si la tarifa
    // tiene otro nombre (p. ej. «Tarifa por hora»), el área queda como estaba.
    const rt = catSel?.rutas.find((r) => r.id === rutaId);
    if (esRecoleccion && rt) {
      const zona = zonaDeRuta(rt.label, t.ns);
      const tipo = servicioRecoleccionDe(zona);
      const opciones = areasRecoleccion(admin);
      const area = opciones.find((a) => a.toLocaleLowerCase("es") === zona.toLocaleLowerCase("es"))
        ?? (tipo ? opciones.find((a) => servicioRecoleccionDe(a) === tipo) : undefined);
      if (area) { next.areaAAASel = area; next.areaAAAOtro = ""; }
    }
    setF(conValor(next));
  };

  /** Recolección: horas efectivas = horómetro final − inicial (si ambos son válidos). */
  const cambiaHorometro = (patch: Partial<Pick<Campos, "horometroInicial" | "horometroFinal">>) => {
    const next = { ...f, ...patch };
    const ini = next.horometroInicial.trim(), fin = next.horometroFinal.trim();
    if (ini !== "" && fin !== "" && num(fin) >= num(ini)) {
      next.horasMaquina = String(Math.round((num(fin) - num(ini)) * 100) / 100);
    }
    setF(conValor(next));
  };
  const horometroCalculado = esRecoleccion && f.horometroInicial.trim() !== "" && f.horometroFinal.trim() !== "" && num(f.horometroFinal) >= num(f.horometroInicial);
  const horometroInvalido = esRecoleccion && f.horometroInicial.trim() !== "" && f.horometroFinal.trim() !== "" && num(f.horometroFinal) < num(f.horometroInicial);
  /** Recolección: los ayudantes solo van en la volqueta sencilla (Cláusula Cuarta). */
  const conAyudantes = esRecoleccion && /sencilla/i.test(catSel?.label ?? "");
  const cambiaAyudante = (idx: number, valor: string) => {
    const lista = [...f.ayudantes];
    lista[idx] = valor;
    setF({ ...f, ayudantes: lista });
  };

  const cambiaPlaca = (v: string) => {
    const next = { ...f, plateSel: v };
    if (v && v !== OTRO) {
      const veh = vehiculosActivos.find((x) => x.plate === v);
      if (veh) {
        next.capacity = sv(veh.capacity);
        if (veh.driver) { next.driverSel = veh.driver; next.driverOtro = ""; }
        if (veh.numeroInterno) next.numeroInterno = veh.numeroInterno;
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
    const errs: Partial<Record<CampoError, string>> = {};
    if (!f.date) errs.date = "La fecha del servicio es obligatoria.";
    else if (f.date < minDate || f.date > maxDate) errs.date = `La fecha debe estar dentro de ${month.label}.`;
    // Alquiler, Emergencia y contratos de la app: las horas son obligatorias y no negativas.
    if (esAlquiler && !esRecoleccion && (f.horasMaquina.trim() === "" || num(f.horasMaquina) < 0)) errs.horasMaquina = "Indica las horas (0 o más).";
    if (horometroInvalido) errs.horometroFinal = "El horómetro final no puede ser menor que el inicial.";
    if (esRecoleccion) {
      // Recolección: el valor sale de horas × valor hora; sin esos datos no hay qué facturar.
      if (!f.tarifaCategoria) errs.tarifaCategoria = "Elige la volqueta o el servicio (o «Sin tarifa en el tarifario»).";
      else if (sinTarifaRec(f)) {
        if (!(f.equipmentSel === OTRO ? f.equipmentOtro.trim() : f.equipmentSel)) errs.equipmentOtro = "Escribe qué servicio se prestó.";
        if (!(num(f.valorHoraManual) > 0)) errs.valorHoraManual = "Digita el valor por hora sin IVA.";
      } else if (!f.tarifaRuta) errs.tarifaRuta = "Elige el tipo de servicio de la tarifa.";
      else if (!(num(tarifaSel(f)?.unitario) > 0)) errs.tarifaRuta = "Esta tarifa aún no tiene precio: regístralo en la pestaña Tarifario.";
      if (!(num(f.horasMaquina) > 0) && !errs.horometroFinal) errs.horasMaquina = "Indica las horas efectivas (o el horómetro inicial y final).";
    }
    const conError = ORDEN_ERRORES.filter((k) => errs[k]);
    if (!conError.length && (num(f.value) < 0 || num(f.tolls) < 0)) { setError("El valor y los peajes no pueden ser negativos."); return; }
    setErrores(errs);
    if (conError.length) {
      setError(conError.length === 1 ? "Revisa el campo marcado en rojo." : `Revisa los ${conError.length} campos marcados en rojo.`);
      // Lleva al primer campo con error.
      const el = document.getElementById(`campo-${conError[0]}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
      return;
    }
    const r = ses.approve(); // sella con el rol de la sesión de plataforma (sin clave)

    const resolver = (sel: string, otro: string) => (sel === OTRO ? otro.trim() : sel);
    const manual = !f.tarifaCategoria || f.tarifaCategoria === "manual";
    const idServicio = editing?.id ?? nuevoServicioId();
    // Los adjuntos nuevos (base64) se suben a Supabase Storage: en el registro queda solo la URL.
    let photoFilesSubidos = f.photoFiles;
    let approvalSubido = f.approvalFile;
    try {
      const ctx = { ns: t.ns, monthKey: month.key, serviceId: idServicio };
      photoFilesSubidos = await Promise.all(f.photoFiles.map((pf) => subirAdjunto(pf, ctx)));
      approvalSubido = f.approvalFile ? await subirAdjunto(f.approvalFile, ctx) : null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron subir los adjuntos.");
      return;
    }
    const item: Servicio = {
      id: idServicio,
      date: f.date,
      orderNo: editing ? f.orderNo.trim() : siguienteOrden(t.servicesByMonth, t.ficha.prefijoOrden),
      serviceType: f.serviceType,
      interventor: resolver(f.interventorSel, f.interventorOtro),
      areaAAA: resolver(f.areaAAASel, f.areaAAAOtro),
      plate: resolver(f.plateSel, f.plateOtro),
      capacity: f.capacity,
      driver: resolver(f.driverSel, f.driverOtro),
      operario: f.operario.trim(),
      equipment: esAlquiler ? (catSel?.label.replace(/^Ítem \d+ · Servicio de (Alquiler de )?/i, "").trim() || resolver(f.equipmentSel, f.equipmentOtro)) : resolver(f.equipmentSel, f.equipmentOtro),
      weight: f.weight,
      pickup: f.pickup.trim(),
      destination: f.destination.trim(),
      area: f.area.trim(),
      hourReq: f.hourReq,
      hourAtt: f.hourAtt,
      value: f.value,
      tolls: esAlquiler ? "0" : f.tolls,
      horasMaquina: esAlquiler ? f.horasMaquina.trim() : undefined,
      valorHora: esAlquiler && esPorHora(f) ? String(num(tarifaSel(f)?.unitario ?? 0)) : sinTarifaRec(f) ? String(num(f.valorHoraManual)) : undefined,
      ivaAlquiler: esAlquiler ? f.ivaAlquiler : undefined,
      ivaTransporte: esAlquiler ? f.ivaTransporte : undefined,
      // Recolección: la tarifa incluye IVA → siempre 19% del valor (también con tarifa manual).
      valorIva: esRecoleccion ? String(Math.round(num(f.value) * 0.19)) : esAlquiler ? String(ivaDe(f).total) : undefined,
      transporteEquipo: esAlquiler ? num(f.viajesEquipo) > 0 : undefined,
      viajesEquipo: esAlquiler ? String(Math.max(0, Math.floor(num(f.viajesEquipo)))) : undefined,
      valorTransporte: esAlquiler && num(f.viajesEquipo) > 0 ? String(num(tarifaTransporte(f)?.unitario ?? 0)) : undefined,
      photo: f.photo,
      approved: f.approved,
      invoiced: f.invoiced,
      recargoNocturno: f.recNocturno,
      recargoDominical: f.recDominical,
      notes: f.notes.trim(),
      photoFiles: photoFilesSubidos,
      approvalFile: approvalSubido,
      tarifaCategoria: manual ? null : f.tarifaCategoria,
      tarifaRuta: manual ? null : f.tarifaRuta || null,
      ...(esRecoleccion ? {
        planilla: f.planilla.trim(),
        numeroInterno: f.numeroInterno.trim(),
        ruta: f.ruta.trim(),
        actividad: f.actividad,
        horaSalida: f.horaSalida,
        horaRetorno: f.horaRetorno,
        horometroInicial: f.horometroInicial.trim(),
        horometroFinal: f.horometroFinal.trim(),
        ayudantes: conAyudantes ? f.ayudantes.map((a) => a.trim()).filter(Boolean).slice(0, MAX_AYUDANTES_RECOLECCION) : [],
        ivaAlquiler: true, // el precio del contrato incluye IVA: siempre se factura con IVA 19%
      } : {}),
      ...(esTransporte ? {
        costoContratista: costoFinal !== null ? String(costoFinal) : undefined,
      } : {}),
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

  /** Lista de sugerencias del navegador para un input libre (vacía = sin datalist). */
  const sugerencias = (id: string, opciones: string[]) =>
    opciones.length ? <datalist id={id}>{opciones.map((o) => <option key={o} value={o} />)}</datalist> : null;

  const recNoct = fmtCOP(num(tarifario?.recargos.nocturno));
  const recDom = fmtCOP(num(tarifario?.recargos.dominicalFestivo));
  const titulo = editing ? "Editar servicio" : "Registrar servicio";
  const subtitulo = month.label + (dupFrom ? " · Duplicado — revisa fecha, horas y evidencia" : "");

  return (
    <>
      <div className="drawer-overlay" onClick={intentarCerrar} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="drawer-title">{titulo}</h2>
            <span className="cc-dias">{subtitulo}</span>
          </div>
          <button className="drawer-close" onClick={intentarCerrar} title="Cerrar (Esc)" aria-label="Cerrar formulario">×</button>
        </div>
        <div className="drawer-body">
          {/* noValidate: la app valida y marca cada campo (en vez de los globos del navegador). */}
          <form onSubmit={guardar} noValidate style={{ display: "grid", gap: 4 }}>
            {seccion("Servicio")}
            <div style={gridAuto}>
              <label className="field">Fecha del servicio *
                <input className="input" required type="date" min={minDate} max={maxDate} value={f.date} {...campoProps("date")}
                  onChange={(e) => cambiaTiempo({ date: e.target.value })} />
                {errorDe("date")}
              </label>
              <label className="field">N° Orden / Remisión
                <input className="input" value={f.orderNo} readOnly={!editing} title={editing ? "" : "Se asigna automáticamente de forma consecutiva"}
                  style={editing ? undefined : { background: "var(--surface-2)", color: "var(--text-2)" }}
                  onChange={(e) => setF({ ...f, orderNo: e.target.value })} />
              </label>
              {/* Recolección: «Tipo de servicio» es Recolección y Transporte / B2B (tarifa); aquí se pregunta la programación. */}
              <label className="field">{esRecoleccion ? "Programación del servicio" : "Tipo de servicio"}
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
              {!esRecoleccion && selectMaestro(
                "Área AAA solicitante", f.areaAAASel, f.areaAAAOtro,
                (admin?.areas ?? []).map((x) => ({ value: x, label: x })),
                "Otra (digitar)",
                (v) => setF({ ...f, areaAAASel: v }),
                (v) => setF({ ...f, areaAAAOtro: v }),
                "Área solicitante",
              )}
            </div>

            {esRecoleccion ? (
              <>
                {seccion("Volqueta y tipo de servicio")}
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
                  Elige la tarifa del contrato: con ella y las horas efectivas se calcula el valor del servicio.
                </div>
                <div style={gridAuto}>
                  <label className="field">Volqueta o servicio *
                    <select value={f.tarifaCategoria} {...campoProps("tarifaCategoria")} onChange={(e) => cambiaCategoria(e.target.value)}>
                      <option value="">— Selecciona —</option>
                      {(tarifario?.categorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.label.replace(/^Ítem \d+ · Servicio de /i, "")}</option>)}
                      <option value={SIN_TARIFA}>Sin tarifa en el tarifario (digitar valor por hora)</option>
                    </select>
                    {errorDe("tarifaCategoria")}
                  </label>
                  {catSel && (
                    <label className="field">Tipo de servicio *
                      <select value={f.tarifaRuta} {...campoProps("tarifaRuta")} onChange={(e) => cambiaRuta(e.target.value)}>
                        <option value="">— Selecciona el tipo de servicio —</option>
                        {rutasHora(f).map((rt) => (
                          <option key={rt.id} value={rt.id}>
                            {etiquetaZona(rt.label)} — {num(rt.unitario) > 0 ? `${fmtCOP(num(rt.unitario))} / hora sin IVA` : "sin precio en el Tarifario"}
                          </option>
                        ))}
                      </select>
                      {errorDe("tarifaRuta")}
                    </label>
                  )}
                  {sinTarifaRec(f) && (
                    <>
                      <label className="field">Servicio prestado *
                        <input className="input" value={f.equipmentOtro} placeholder="Ej. Minicargador" {...campoProps("equipmentOtro")}
                          onChange={(e) => setF({ ...f, equipmentSel: OTRO, equipmentOtro: e.target.value })} />
                        {errorDe("equipmentOtro")}
                      </label>
                      <label className="field">Valor por hora sin IVA *
                        <input className="input num" type="number" min="0" step="1" value={f.valorHoraManual} placeholder="Ej. 180000" {...campoProps("valorHoraManual")}
                          onChange={(e) => cambiaValorHoraManual(e.target.value)} />
                        <MontoAyuda valor={f.valorHoraManual} prefijo="por hora:" />
                        {errorDe("valorHoraManual")}
                      </label>
                    </>
                  )}
                  {selectMaestro(
                    "Área AAA solicitante", f.areaAAASel, f.areaAAAOtro,
                    areasRecoleccion(admin).map((x) => ({ value: x, label: x })),
                    "Otra (digitar)",
                    (v) => setF({ ...f, areaAAASel: v }),
                    (v) => setF({ ...f, areaAAAOtro: v }),
                    "Área solicitante",
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {sinTarifaRec(f)
                    ? "El valor por hora se usa solo en este registro. Para tenerlo disponible en los próximos, agrega el servicio en la pestaña Tarifario."
                    : "El área AAA se llena sola al elegir el tipo de servicio; puedes cambiarla si otra área hizo la solicitud."}
                </div>
                {tarifaHint && <div className="muted" style={{ fontSize: 12.5 }}>{tarifaHint}</div>}
              </>
            ) : (
              <>
            {seccion(esEmergencia ? "Tarifa del contrato (volqueta y zona — calcula el valor automáticamente)" : esAlquiler ? "Tarifa del contrato (equipo y zona — calcula el valor automáticamente)" : "Tarifa del pliego (opcional — calcula el valor automáticamente)")}
            <div style={gridAuto}>
              <label className="field">{esVolqueta ? "Volqueta (tarifario del contrato)" : esAlquiler ? "Equipo (tarifario del contrato)" : "Categoría del tarifario"}
                <select value={f.tarifaCategoria} onChange={(e) => cambiaCategoria(e.target.value)}>
                  <option value="">Tarifa manual (digitar el valor)</option>
                  {(tarifario?.categorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              {catSel && !esAlquiler && (
                <label className="field">Ruta del pliego
                  <select value={f.tarifaRuta} onChange={(e) => cambiaRuta(e.target.value)}>
                    <option value="">— Selecciona la ruta —</option>
                    {catSel.rutas.map((rt) => (
                      <option key={rt.id} value={rt.id}>{rt.id} · {rt.label} — {fmtCOP(num(rt.unitario))}</option>
                    ))}
                  </select>
                </label>
              )}
              {catSel && esAlquiler && (
                <label className="field">{esRecoleccion ? "Tipo de servicio (área AAA)" : "Zona del servicio"}
                  <select value={f.tarifaRuta} onChange={(e) => cambiaRuta(e.target.value)}>
                    <option value="">{esRecoleccion ? "— Selecciona el tipo de servicio —" : "— Selecciona la zona —"}</option>
                    {rutasHora(f).map((rt) => (
                      <option key={rt.id} value={rt.id}>{etiquetaZona(rt.label)} — {fmtCOP(num(rt.unitario))} / hora{esVolqueta ? " sin IVA" : ""}</option>
                    ))}
                  </select>
                </label>
              )}
              {catSel && esAlquiler && !esVolqueta && f.tarifaRuta && (
                <label className="field">Viajes de transporte del equipo{tarifaTransporte(f) ? <span className="muted" style={{ fontWeight: 400 }}> · {fmtCOP(num(tarifaTransporte(f)!.unitario))} por viaje</span> : null}
                  <input className="input num" type="number" min="0" step="1" value={f.viajesEquipo}
                    onChange={(e) => setF(conValor({ ...f, viajesEquipo: e.target.value }))} placeholder="0" />
                </label>
              )}
            </div>
            {tarifaHint && <div className="muted" style={{ fontSize: 12.5 }}>{tarifaHint}</div>}
              </>
            )}
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

            {seccion(esVolqueta ? "Volqueta y conductor" : esAlquiler ? "Operario" : "Vehículo y carga")}
            <div style={gridAuto}>
              {(!esAlquiler || esVolqueta) && selectMaestro(
                "Placa del vehículo", f.plateSel, f.plateOtro,
                vehiculosActivos.map((v) => ({ value: v.plate, label: esRecoleccion
                  ? `${v.plate}${v.numeroInterno ? ` (${v.numeroInterno})` : ""} · ${v.tipo || "volqueta"} · ${num(v.capacity)} m³ · ${v.driver || "sin conductor"}`
                  : `${v.plate} · ${num(v.capacity)} T · ${v.driver || "sin conductor"}` })),
                "Otra placa (digitar)",
                cambiaPlaca,
                (v) => setF({ ...f, plateOtro: v.toUpperCase() }),
                "ABC-123",
              )}
              {!esAlquiler && <label className="field">Capacidad del vehículo (Ton)
                <input className="input num" type="number" step="0.1" min="0" value={f.capacity}
                  onChange={(e) => setF({ ...f, capacity: e.target.value })} />
              </label>}
              {(!esAlquiler || esVolqueta) && selectMaestro(
                "Conductor", f.driverSel, f.driverOtro,
                conductores.map((d) => ({ value: d, label: d === designado ? `${d} (designado)` : d })),
                "Otro conductor (digitar)",
                (v) => setF({ ...f, driverSel: v }),
                (v) => setF({ ...f, driverOtro: v }),
                "Nombre del conductor",
              )}
              {!esAlquiler && selectMaestro(
                "Equipo / máquina transportada", f.equipmentSel, f.equipmentOtro,
                equipos.map((eq) => ({ value: eq.name, label: `${eq.name} · ${eq.clase || "equipo"} · ${num(eq.weight)} T` })),
                "Otro equipo (digitar)",
                cambiaEquipo,
                (v) => setF({ ...f, equipmentOtro: v }),
                "Equipo transportado",
              )}
              {!esAlquiler && <label className="field">Peso del equipo (Ton)
                <input className="input num" type="number" step="0.01" min="0" value={f.weight}
                  onChange={(e) => setF({ ...f, weight: e.target.value })} />
              </label>}
              {esRecoleccion && (
                <label className="field">N° interno del vehículo
                  <input className="input" value={f.numeroInterno} list="sug-internos" placeholder="Ej. VD-03"
                    onChange={(e) => setF({ ...f, numeroInterno: e.target.value })} />
                  {sugerencias("sug-internos", sugInternos)}
                </label>
              )}
              {conAyudantes && Array.from({ length: MAX_AYUDANTES_RECOLECCION }, (_, i) => (
                <label key={i} className="field">Ayudante {i + 1}
                  <input className="input" value={f.ayudantes[i] ?? ""} list="sug-ayudantes" placeholder="Nombre del ayudante (opcional)"
                    onChange={(e) => cambiaAyudante(i, e.target.value)} />
                </label>
              ))}
              {conAyudantes && sugerencias("sug-ayudantes", sugAyudantes)}
              {!esVolqueta && <label className="field">Nombre del operario
                <input className="input" value={f.operario} placeholder="Operario del equipo" list="sug-operarios"
                  onChange={(e) => setF({ ...f, operario: e.target.value })} />
                {sugerencias("sug-operarios", sugOperarios)}
              </label>}
            </div>

            {esRecoleccion && (
              <>
                {seccion("Planilla de despacho")}
                <div style={gridAuto}>
                  <label className="field">N° de planilla
                    <input className="input" value={f.planilla} placeholder="Folio de la planilla"
                      onChange={(e) => setF({ ...f, planilla: e.target.value })} />
                  </label>
                  <label className="field">Actividad
                    <select value={f.actividad} onChange={(e) => setF({ ...f, actividad: e.target.value })}>
                      <option value="">— Selecciona la actividad —</option>
                      {ACTIVIDADES_RECOLECCION.map((a) => <option key={a} value={a}>{a}</option>)}
                      {f.actividad && !ACTIVIDADES_RECOLECCION.includes(f.actividad) && <option value={f.actividad}>{f.actividad}</option>}
                    </select>
                  </label>
                  <label className="field">Ruta asignada
                    <input className="input" value={f.ruta} list="sug-rutas" placeholder="Ruta del despacho de Triple A"
                      onChange={(e) => setF({ ...f, ruta: e.target.value })} />
                    {sugerencias("sug-rutas", sugRutas)}
                  </label>
                </div>
              </>
            )}

            {seccion(esAlquiler ? "Lugar del servicio" : "Ruta")}
            <div style={gridAuto}>
              {esRecoleccion && <label className="field">Disposición final
                <input className="input" value={f.destination} list="sug-disposicion" placeholder="Sitio donde se descargó"
                  onChange={(e) => setF({ ...f, destination: e.target.value })} />
                {sugerencias("sug-disposicion", [...new Set([DESTINO_RECOLECCION, ...sugSitios])])}
              </label>}
              {!esAlquiler && <label className="field">Lugar de recogida
                <input className="input" value={f.pickup} list="sug-sitios" placeholder="Escribe o elige uno ya usado"
                  onChange={(e) => setF({ ...f, pickup: e.target.value })} />
              </label>}
              {!esAlquiler && <label className="field">Lugar de destino
                <input className="input" value={f.destination} list="sug-sitios" placeholder="Escribe o elige uno ya usado"
                  onChange={(e) => setF({ ...f, destination: e.target.value })} />
              </label>}
              <label className="field">Municipio / área de prestación
                <input className="input" value={f.area} list="sug-areas" placeholder="Escribe o elige uno ya usado"
                  onChange={(e) => setF({ ...f, area: e.target.value })} />
              </label>
              {sugerencias("sug-sitios", sugSitios)}
              {sugerencias("sug-areas", sugAreas)}
            </div>

            {seccion(esVolqueta ? "Horas efectivas" : esAlquiler ? "Horas máquina" : "Tiempos de atención")}
            {esRecoleccion && (
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
                Digita el horómetro inicial y final de la planilla: las horas efectivas se calculan solas.
              </div>
            )}
            <div style={gridAuto}>
              {esRecoleccion && <>
                <label className="field">Hora de salida
                  <input className="input" type="time" value={f.horaSalida} onChange={(e) => setF({ ...f, horaSalida: e.target.value })} />
                </label>
                <label className="field">Hora de retorno
                  <input className="input" type="time" value={f.horaRetorno} onChange={(e) => setF({ ...f, horaRetorno: e.target.value })} />
                </label>
                <label className="field">Horómetro inicial
                  <input className="input num" type="number" min="0" step="0.1" value={f.horometroInicial}
                    aria-invalid={horometroInvalido || undefined}
                    onChange={(e) => cambiaHorometro({ horometroInicial: e.target.value })} />
                </label>
                <label className="field">Horómetro final
                  <input className="input num" type="number" min="0" step="0.1" value={f.horometroFinal} id="campo-horometroFinal"
                    aria-invalid={horometroInvalido || !!errores.horometroFinal || undefined} aria-describedby={horometroInvalido ? "horometro-error" : undefined}
                    onChange={(e) => cambiaHorometro({ horometroFinal: e.target.value })} />
                </label>
              </>}
              {esRecoleccion && f.serviceType === "Emergencia" && <>
                <label className="field">Hora de la solicitud
                  <input className="input" type="time" value={f.hourReq} onChange={(e) => setF({ ...f, hourReq: e.target.value })} />
                </label>
                <label className="field">Hora de llegada al sitio
                  <input className="input" type="time" value={f.hourAtt} onChange={(e) => setF({ ...f, hourAtt: e.target.value })} />
                </label>
                <label className="field">Tiempo de respuesta <span className="muted" style={{ fontWeight: 400 }}>· máximo 3 h</span>
                  <input className="input num" readOnly value={(() => { const h = respHours(f.hourReq, f.hourAtt); if (h == null) return ""; return `${h} h${h > 3 ? " · fuera de tiempo" : ""}`; })()} style={{ background: "var(--surface-2)", color: (respHours(f.hourReq, f.hourAtt) ?? 0) > 3 ? "var(--high)" : "var(--text-2)" }} />
                </label>
              </>}
              {esAlquiler && (
                <label className="field">{esVolqueta ? "Horas efectivas *" : "Horas máquina usadas *"}{horometroCalculado && <span className="muted" style={{ fontWeight: 400 }}> · según horómetro</span>}
                  <input className="input num" type="number" min="0" step="any" required value={f.horasMaquina} placeholder="Ej. 8" {...campoProps("horasMaquina")}
                    readOnly={horometroCalculado} style={horometroCalculado ? { background: "var(--surface-2)", color: "var(--text-2)" } : undefined}
                    onChange={(e) => setF(conValor({ ...f, horasMaquina: e.target.value }))} />
                  {errorDe("horasMaquina")}
                </label>
              )}
              {!esAlquiler && <label className="field">Hora solicitada
                <input className="input" type="time" value={f.hourReq} onChange={(e) => cambiaTiempo({ hourReq: e.target.value })} />
              </label>}
              {!esAlquiler && <label className="field">Hora atendida
                <input className="input" type="time" value={f.hourAtt} onChange={(e) => cambiaTiempo({ hourAtt: e.target.value })} />
              </label>}
              {!esAlquiler && <label className="field">Tiempo de respuesta
                <input className="input num" readOnly value={(() => { const h = respHours(f.hourReq, f.hourAtt); if (h == null) return ""; const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${h} h (${hh}:${String(mm).padStart(2, "0")})`; })()} style={{ background: "var(--surface-2)", color: "var(--text-2)" }} />
              </label>}
            </div>

            {horometroInvalido && <div id="horometro-error" role="alert" style={{ color: "var(--high)", fontSize: 12.5 }}>El horómetro final no puede ser menor que el inicial.</div>}

            {seccion(esRecoleccion ? "Valor del servicio" : "Financiero")}
            {esAlquiler && (() => {
              const d = ivaDe(f); const r = tarifaSel(f);
              const ro: React.CSSProperties = { background: "var(--surface-2)", color: "var(--text-2)" };
              const fila: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) auto minmax(0, 1fr) minmax(0, 1fr)", gap: 10, alignItems: "center", padding: "8px 10px", background: "var(--surface-2)", borderRadius: 8, fontSize: 13 };
              return (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={fila}>
                    <span><b>{esVolqueta ? "Servicio de volqueta" : "Alquiler del equipo"}</b><br /><span className="muted" style={{ fontSize: 12 }}>{r || sinTarifaRec(f) ? `${d.horas} h × ${fmtCOP(d.unit)} (${esVolqueta ? "hora" : "hora máquina"})` : esRecoleccion ? "Selecciona volqueta, tipo de servicio y horas" : esEmergencia ? "Selecciona volqueta, zona y horas" : "Selecciona equipo, zona y horas"}</span></span>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }} title={esRecoleccion ? "El precio del contrato incluye IVA" : undefined}><input type="checkbox" checked={f.ivaAlquiler} disabled={esRecoleccion} onChange={(e) => setF({ ...f, ivaAlquiler: e.target.checked })} /> IVA 19%</label>
                    <span className="num" style={{ textAlign: "right" }}>Base <b>{fmtCOP(d.alq)}</b></span>
                    <span className="num" style={{ textAlign: "right" }}>IVA <b>{fmtCOP(d.ivaAlq)}</b></span>
                  </div>
                  {!esVolqueta && <div style={fila}>
                    <span><b>Transporte del equipo</b><br /><span className="muted" style={{ fontSize: 12 }}>{d.viajes > 0 && d.tr ? `${d.viajes} viaje(s) × ${fmtCOP(d.vViaje)}` : "Sin viajes"}</span></span>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}><input type="checkbox" checked={f.ivaTransporte} onChange={(e) => setF({ ...f, ivaTransporte: e.target.checked })} /> IVA 19%</label>
                    <span className="num" style={{ textAlign: "right" }}>Base <b>{fmtCOP(d.trans)}</b></span>
                    <span className="num" style={{ textAlign: "right" }}>IVA <b>{fmtCOP(d.ivaTr)}</b></span>
                  </div>}
                  <div style={{ ...fila, background: "var(--brand-soft)", gridTemplateColumns: "1fr auto auto auto" }}>
                    <b>Total del servicio</b>
                    <span className="num">Base <b>{fmtCOP(d.alq + d.trans)}</b></span>
                    <span className="num">IVA <b>{fmtCOP(d.total)}</b></span>
                    <span className="num">Con IVA <b>{fmtCOP(d.alq + d.trans + d.total)}</b></span>
                  </div>
                  <input type="hidden" value={fmtCOP(d.unit)} readOnly style={ro} />
                </div>
              );
            })()}
            {/* Recolección: el valor siempre es horas × valor hora (se muestra arriba, no se digita). */}
            {!esRecoleccion && <div style={gridAuto}>
              <label className="field">{esAlquiler ? "Valor del servicio sin IVA (COP)" : "Valor del servicio (COP)"}{esAlquiler && tarifaSel(f) && <span className="muted" style={{ fontWeight: 400 }}> · calculado</span>}
                <input className="input num" type="number" step="1" min="0" value={f.value}
                  onChange={(e) => setF({ ...f, value: e.target.value })} />
                <MontoAyuda valor={f.value} />
              </label>
              {!esAlquiler && (
                <label className="field">Peajes (COP)
                  <input className="input num" type="number" step="1" min="0" value={f.tolls}
                    onChange={(e) => setF({ ...f, tolls: e.target.value })} />
                  <MontoAyuda valor={f.tolls} />
                </label>
              )}
            </div>}

            {esTransporte && (
              <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "10px 12px", display: "grid", gap: 8, background: "var(--surface-2)" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Costo del contratista <span className="muted" style={{ fontWeight: 400 }}>· uso interno, no sale en PDF ni exportaciones</span></div>
                <div style={gridAuto}>
                  <label className="field">Costo contratista (neto, COP)
                    <input className="input num" type="number" step="1" min="0" value={costoTxt}
                      placeholder={costoAuto !== null ? String(costoAuto) : "Digita el costo (tarifa manual)"}
                      onChange={(e) => setCostoTxt(e.target.value)} />
                    <MontoAyuda valor={costoTxt} />
                  </label>
                  <label className="field">Margen del servicio
                    <input className="input num" readOnly style={{ background: "var(--surface)", color: "var(--text-2)" }}
                      value={costoFinal !== null ? `${fmtCOP(num(f.value) - costoFinal)}${num(f.value) > 0 ? ` (${(((num(f.value) - costoFinal) / num(f.value)) * 100).toFixed(1)}%)` : ""}` : "—"} />
                  </label>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {costoTxt.trim() !== ""
                    ? "Costo fijado a mano. Bórralo para usar la tarifa de costo de la ruta."
                    : costoAuto !== null ? `Automático: tarifa de costo de la ruta${f.recNocturno || f.recDominical ? " + recargos" : ""} = ${fmtCOP(costoAuto)}.` : "Tarifa manual: digita el costo que se le paga al contratista."}
                </div>
              </div>
            )}

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
              <button type="button" className="btn btn-ghost" onClick={intentarCerrar}>Cancelar</button>
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
        <ConfirmarEliminacion
          abierto={confirmarCierre}
          titulo={editing ? "¿Descartar los cambios de este registro?" : "¿Descartar el registro sin guardar?"}
          descripcion="Hay datos escritos que no se han guardado. Si cierras ahora, se pierden."
          irreversible={false}
          textoConfirmar="Sí, descartar"
          textoCancelar="Seguir editando"
          onCancelar={() => setConfirmarCierre(false)}
          onConfirmar={() => { setConfirmarCierre(false); onClose(); }}
        />
      </aside>
    </>
  );
}
