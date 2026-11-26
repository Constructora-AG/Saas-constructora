// ════════════════════════════════════════════════════════════════════
// Referencia Smarthome para la REVISIÓN de informes mensuales de cartera.
// Solo lectura y solo lo validado contra los informes de 2026:
//
//   · Proyecto: únicamente Lotes Reserva del Manantial. Aqua no se compara
//     (la sincronización no conserva los pagos de ventas desistidas) y
//     Cascada Real no está en Smarthome.
//   · Separaciones del mes = pagos a la PRIMERA cuota del plan de cada venta
//     (ventas nuevas del mes; no forman parte del recaudo que informa cartera).
//   · Recaudo real = pagos de cuota inicial del mes − separaciones.
//     Coincide exactamente con el informe en 8 de 10 meses (ene–oct 2026) y en
//     octubre identifica los mismos 3 clientes del PDF.
//   · El programado NO se compara: el informe lo ajusta por pagos anticipados.
// ════════════════════════════════════════════════════════════════════

/** Tipos de cuota que no son cuota inicial: 5 = crédito; 2 y 3 sin confirmar. */
const TIPOS_EXCLUIDOS = new Set([2, 3, 5]);

/** El id de un abono es `<payment_id de la cuota>-<id del pago>`. */
export const cuotaDeAbono = (abonoId: string) => abonoId.slice(0, 36);

export interface CuotaSH { payment_id: string; prospect_id: string; fecha: string | null; tipo: number | null }
export interface AbonoSH { id: string; prospect_id: string; fecha: string | null; monto: number | null }
export interface ClienteSH { cliente: string | null; module: string | null }

export interface SeparacionSH { prospect_id: string; cliente: string; unidad: string; valor: number }

export interface ReferenciaLotes {
  /** Pagos de cuota inicial recibidos en el mes (incluye separaciones). */
  recaudoTotal: number;
  separacionesTotal: number;
  /** Recaudo real comparable con el informe: total − separaciones. */
  recaudoReal: number;
  /** Desglose del recaudo real según la cuota que paga cada abono. */
  delMes: number;
  anticipado: number;
  moraRecuperada: number;
  separaciones: SeparacionSH[];
}

/**
 * `cuotas`: todas las cuotas de Lotes (para saber cuál es la primera de cada venta).
 * `abonos`: abonos de Lotes (se filtran al mes de `periodo`, YYYY-MM-01).
 */
/** Cuotas por id, primera cuota (separación) de cada venta y cuáles son separaciones. */
function estructura(cuotas: CuotaSH[]) {
  const porId = new Map(cuotas.map((c) => [c.payment_id, c]));
  // Primera cuota (no crédito) de cada venta = su separación.
  const primera = new Map<string, CuotaSH>();
  for (const c of cuotas) {
    if (c.tipo === 5 || !c.fecha) continue;
    const p = primera.get(c.prospect_id);
    if (!p || c.fecha < (p.fecha as string)) primera.set(c.prospect_id, c);
  }
  const esSeparacion = new Set([...primera.values()].map((c) => c.payment_id));
  const esCuotaInicial = (c: CuotaSH | undefined): c is CuotaSH => !!c && !(c.tipo !== null && TIPOS_EXCLUIDOS.has(c.tipo));
  return { porId, primera, esSeparacion, esCuotaInicial };
}

export function calcularReferenciaLotes(
  periodo: string,
  cuotas: CuotaSH[],
  abonos: AbonoSH[],
  clientes: Map<string, ClienteSH>,
): ReferenciaLotes {
  const mes = periodo.slice(0, 7);
  const { porId, esSeparacion } = estructura(cuotas);

  const r: ReferenciaLotes = { recaudoTotal: 0, separacionesTotal: 0, recaudoReal: 0, delMes: 0, anticipado: 0, moraRecuperada: 0, separaciones: [] };
  const sep = new Map<string, number>();
  for (const a of abonos) {
    if (a.fecha?.slice(0, 7) !== mes) continue;
    const cuota = porId.get(cuotaDeAbono(a.id));
    if (!cuota || (cuota.tipo !== null && TIPOS_EXCLUIDOS.has(cuota.tipo))) continue;
    const monto = a.monto ?? 0;
    r.recaudoTotal += monto;
    if (esSeparacion.has(cuota.payment_id)) {
      r.separacionesTotal += monto;
      sep.set(a.prospect_id, (sep.get(a.prospect_id) ?? 0) + monto);
      continue;
    }
    const mesCuota = cuota.fecha?.slice(0, 7) ?? mes;
    if (mesCuota === mes) r.delMes += monto;
    else if (mesCuota > mes) r.anticipado += monto;
    else r.moraRecuperada += monto;
  }
  r.recaudoReal = r.recaudoTotal - r.separacionesTotal;
  r.separaciones = [...sep].map(([pid, valor]) => ({
    prospect_id: pid,
    cliente: (clientes.get(pid)?.cliente ?? "").replace(/\s+/g, " ").trim() || "Cliente sin nombre",
    unidad: clientes.get(pid)?.module ?? "",
    valor,
  })).sort((a, b) => b.valor - a.valor);
  return r;
}

const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);

/** ¿El cliente de Smarthome está entre las separaciones del informe? (coinciden al menos 2 palabras del nombre). */
export function separacionEnInforme(cliente: string, nombresInforme: string[]): boolean {
  const a = new Set(normal(cliente));
  return nombresInforme.some((n) => normal(n).filter((p) => a.has(p)).length >= 2);
}

// ── Pista de la causa de una diferencia ─────────────────────────────

export type TipoPista = "venta_nueva" | "pago_no_incluido" | "otro_mes" | "sin_causa";
export interface PistaDiferencia { tipo: TipoPista; texto: string }

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const mesDesplazado = (mes: string, n: number) => {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * Posible causa de una diferencia (Smarthome − informe) en el recaudo real de
 * Lotes. Solo propone patrones verificables en los datos; si no hay ninguno,
 * lo dice. `abonos` debe incluir el mes anterior y el siguiente.
 */
export function pistaDiferencia(
  periodo: string,
  diferencia: number,
  cuotas: CuotaSH[],
  abonos: AbonoSH[],
  clientes: Map<string, ClienteSH>,
): PistaDiferencia | null {
  if (Math.abs(diferencia) < 1) return null;
  const mes = periodo.slice(0, 7);
  const { porId, primera, esSeparacion, esCuotaInicial } = estructura(cuotas);
  const nombre = (pid: string) => {
    const c = clientes.get(pid);
    const n = (c?.cliente ?? "").replace(/\s+/g, " ").trim() || "un cliente";
    return c?.module ? `${n} (${c.module.toLowerCase()})` : n;
  };
  const deCuotaInicial = abonos.filter((a) => esCuotaInicial(porId.get(cuotaDeAbono(a.id))));
  const noSeparacion = (a: AbonoSH) => !esSeparacion.has(cuotaDeAbono(a.id));

  if (diferencia > 0) {
    // 1. Venta nueva que pagó una segunda cuota en su mismo mes de compra (el informe suele contarla como venta).
    const extra = deCuotaInicial.filter((a) => {
      if (a.fecha?.slice(0, 7) !== mes || !noSeparacion(a)) return false;
      const q = porId.get(cuotaDeAbono(a.id));
      return q?.fecha?.slice(0, 7) === primera.get(a.prospect_id)?.fecha?.slice(0, 7);
    });
    const sumaExtra = extra.reduce((t, a) => t + (a.monto ?? 0), 0);
    if (extra.length && Math.abs(sumaExtra - diferencia) < 1) {
      const quienes = lista([...new Set(extra.map((a) => nombre(a.prospect_id)))]);
      return {
        tipo: "venta_nueva",
        texto: `${quienes} ${extra.length === 1 ? "es una venta nueva que pagó" : "son ventas nuevas que pagaron"} ${COP.format(diferencia)} a una segunda cuota en su mismo mes de compra. El informe suele contar ese dinero como venta, no como recaudo.`,
      };
    }
    // 2. Un pago del mes por exactamente la diferencia que el informe no habría incluido.
    const igual = deCuotaInicial.find((a) => a.fecha?.slice(0, 7) === mes && noSeparacion(a) && Math.abs((a.monto ?? 0) - diferencia) < 1);
    if (igual?.fecha) {
      return { tipo: "pago_no_incluido", texto: `El informe no habría incluido el pago de ${COP.format(diferencia)} de ${nombre(igual.prospect_id)} del ${fecha(igual.fecha)}.` };
    }
  }
  // 3. Un pago por el mismo valor con fecha en el mes anterior o el siguiente.
  const vecinos = [mesDesplazado(mes, -1), mesDesplazado(mes, 1)];
  const otro = deCuotaInicial.find((a) => vecinos.includes(a.fecha?.slice(0, 7) ?? "") && noSeparacion(a) && Math.abs((a.monto ?? 0) - Math.abs(diferencia)) < 1);
  if (otro?.fecha) {
    return { tipo: "otro_mes", texto: `Smarthome tiene un pago de ${COP.format(Math.abs(diferencia))} de ${nombre(otro.prospect_id)} con fecha ${fecha(otro.fecha)}; pudo registrarse en un mes distinto al del informe.` };
  }
  return { tipo: "sin_causa", texto: "Sin causa identificada en Smarthome: puede ser un pago anulado o reprogramado, o un ajuste hecho en el informe." };
}

/** Comparación de un mes contra el informe guardado (la calcula la ruta de referencia). */
export interface ComparacionSmarthome { informeReal: number | null; diferencia: number | null; pista: PistaDiferencia | null }

// ── Clientes en mora del informe, verificados en Smarthome ──────────

export interface CuotaPlanSH extends CuotaSH { programado: number | null }
export interface ClienteCarteraSH { prospect_id: string; cliente: string | null; module: string | null; project_name: string | null }

/** Proyecto del informe → patrón del proyecto en Smarthome (null: no está en Smarthome). */
export function proyectoSmarthome(proyecto: string): RegExp | null {
  if (proyecto === "lotes_manantial") return /manantial/i;
  if (proyecto === "aqua_e1" || proyecto === "aqua_e2") return /aqua/i;
  return null; // Cascada Real Etapa 1
}

const mismoNombre = (a: string, b: string) => {
  const x = new Set(normal(a));
  return normal(b).filter((p) => x.has(p)).length >= 2;
};

/**
 * Ventas en Smarthome de un cliente del informe: la vinculada a su ficha (si la hay)
 * y las demás del mismo proyecto con el mismo nombre (un cliente puede tener varios lotes).
 */
export function ventasDelCliente(nombre: string, prospectId: string | null, proyecto: string, cartera: ClienteCarteraSH[]): ClienteCarteraSH[] {
  const patron = proyectoSmarthome(proyecto);
  if (!patron) return [];
  const delProyecto = cartera.filter((c) => patron.test(c.project_name ?? ""));
  const base = prospectId ? delProyecto.find((c) => c.prospect_id === prospectId) : undefined;
  const referencia = base?.cliente ?? nombre;
  return delProyecto.filter((c) => c.prospect_id === prospectId || mismoNombre(c.cliente ?? "", referencia));
}

export interface EstadoCuentaCliente {
  /** Cuotas de cuota inicial vencidas al cierre del mes y no pagadas. */
  mora: number;
  cuotasVencidas: number;
  /** Días desde la cuota vencida más antigua hasta el cierre del mes. */
  diasMora: number;
  ultimoPago: string | null;
  pagadoMes: number;
}

/** Estado de cuenta al cierre del mes (`periodo` = YYYY-MM-01) con las cuotas y abonos de sus ventas. */
export function estadoAlCierre(periodo: string, cuotas: CuotaPlanSH[], abonos: AbonoSH[]): EstadoCuentaCliente {
  const mes = periodo.slice(0, 7);
  const fin = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const inicial = new Map(cuotas.filter((c) => !(c.tipo !== null && TIPOS_EXCLUIDOS.has(c.tipo))).map((c) => [c.payment_id, c]));
  const pagado = new Map<string, number>();
  let ultimoPago: string | null = null, pagadoMes = 0;
  for (const a of abonos) {
    if (!a.fecha || a.fecha > fin || !inicial.has(cuotaDeAbono(a.id))) continue;
    pagado.set(cuotaDeAbono(a.id), (pagado.get(cuotaDeAbono(a.id)) ?? 0) + (a.monto ?? 0));
    if (!ultimoPago || a.fecha > ultimoPago) ultimoPago = a.fecha;
    if (a.fecha.slice(0, 7) === mes) pagadoMes += a.monto ?? 0;
  }
  let mora = 0, cuotasVencidas = 0, masAntigua: string | null = null;
  for (const c of inicial.values()) {
    if (!c.fecha || c.fecha > fin) continue;
    const pendiente = (c.programado ?? 0) - (pagado.get(c.payment_id) ?? 0);
    if (pendiente > 0.5) {
      mora += pendiente;
      cuotasVencidas++;
      if (!masAntigua || c.fecha < masAntigua) masAntigua = c.fecha;
    }
  }
  const diasMora = masAntigua ? Math.round((Date.parse(fin) - Date.parse(masAntigua)) / 86_400_000) : 0;
  return { mora, cuotasVencidas, diasMora, ultimoPago, pagadoMes };
}

export interface VerificacionCliente {
  cliente: string;
  proyecto: string;
  detalle: string;
  /** Valor en mora que reporta el informe. */
  valorInforme: number;
  /** «no_aplica»: el proyecto no está en Smarthome (Cascada Real). */
  resultado: "encontrado" | "no_encontrado" | "no_aplica";
  unidades: string[];
  estado: EstadoCuentaCliente | null;
}

/** Verifica en Smarthome cada cliente en mora destacado del informe. */
export function verificarMoraDestacada(
  periodo: string,
  moraDestacada: { proyecto: string; cliente: string; prospect_id: string | null; detalle: string; valor: number }[],
  cartera: ClienteCarteraSH[],
  cuotas: CuotaPlanSH[],
  abonos: AbonoSH[],
): VerificacionCliente[] {
  return moraDestacada.map((m) => {
    const base = { cliente: m.cliente, proyecto: m.proyecto, detalle: m.detalle, valorInforme: m.valor };
    if (!proyectoSmarthome(m.proyecto)) return { ...base, resultado: "no_aplica" as const, unidades: [], estado: null };
    const ventas = ventasDelCliente(m.cliente, m.prospect_id, m.proyecto, cartera);
    if (!ventas.length) return { ...base, resultado: "no_encontrado" as const, unidades: [], estado: null };
    const ids = new Set(ventas.map((v) => v.prospect_id));
    return {
      ...base,
      resultado: "encontrado" as const,
      unidades: ventas.map((v) => (v.module ?? "").toLowerCase()).filter(Boolean),
      estado: estadoAlCierre(periodo, cuotas.filter((c) => ids.has(c.prospect_id)), abonos.filter((a) => ids.has(a.prospect_id))),
    };
  });
}

// ── Datos por depurar: unidades con dos ventas activas ──────────────

export interface UnidadDuplicada { proyecto: string; unidad: string; clientes: string[] }

/** Lotes o apartamentos con más de una venta activa en Smarthome (ventas viejas sin anular). */
export function unidadesDuplicadas(cartera: ClienteCarteraSH[]): UnidadDuplicada[] {
  const grupos = new Map<string, ClienteCarteraSH[]>();
  for (const c of cartera) {
    const unidad = (c.module ?? "").replace(/\s+/g, " ").trim().toUpperCase();
    if (!unidad) continue;
    const k = `${c.project_name ?? ""}|${unidad}`;
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  return [...grupos.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([k, v]) => ({
      proyecto: k.split("|")[0],
      unidad: k.split("|")[1].toLowerCase(),
      clientes: v.map((c) => (c.cliente ?? "").replace(/\s+/g, " ").trim() || "Cliente sin nombre"),
    }))
    .sort((a, b) => a.proyecto.localeCompare(b.proyecto) || a.unidad.localeCompare(b.unidad, "es", { numeric: true }));
}
