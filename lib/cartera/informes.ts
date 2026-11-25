// ════════════════════════════════════════════════════════════════════
// Informes mensuales de gestión de cartera (franja «Informe mensual» en /cartera).
// Tipos, lista fija de proyectos, cálculos (subtotales e indicadores) y
// validación de lo que llega a la API. Compartido por servidor y cliente.
//
// Estructura tomada del «Cuadro control de recaudo y mora» y del
// «Informe de Gestión de Cartera» mensual:
//   · Recaudo real = recaudo pagado − separaciones eliminadas del proyecto.
//   · Indicador de recaudo = recaudo real / recaudo programado.
//   · Indicador de cartera = cartera en mora / cartera total.
// ════════════════════════════════════════════════════════════════════

/** Proyectos del informe, separados como en el cuadro de control (Excel). */
export const PROYECTOS_INFORME = [
  { id: "cascada_real_e1", nombre: "Cascada Real Etapa 1" },
  { id: "aqua_e1", nombre: "Aqua Etapa 1" },
  { id: "aqua_e2", nombre: "Aqua Etapa 2" },
  { id: "lotes_manantial", nombre: "Lotes Reserva del Manantial" },
] as const;

export type ProyectoInforme = (typeof PROYECTOS_INFORME)[number]["id"];

export const NOMBRE_PROYECTO: Record<ProyectoInforme, string> = Object.fromEntries(
  PROYECTOS_INFORME.map((p) => [p.id, p.nombre]),
) as Record<ProyectoInforme, string>;

export function esProyectoInforme(v: unknown): v is ProyectoInforme {
  return PROYECTOS_INFORME.some((p) => p.id === v);
}

export interface CifraProyecto {
  proyecto: ProyectoInforme;
  /** Todo lo pagado en el mes, incluidas las separaciones. */
  recaudo_pagado: number;
  recaudo_programado: number;
  mora: number;
  cartera_total: number;
  /**
   * Explicación de quien sube el informe cuando la cartera total cambia más
   * del 50 % frente al informe anterior (ventas nuevas, desistimientos, cierre
   * de etapa, corrección…). Obligatoria para enviar a revisión en ese caso.
   */
  justificacion_cartera?: string | null;
}

export interface SeparacionInforme {
  proyecto: ProyectoInforme;
  cliente: string;
  lote: string;
  manzana: string;
  valor: number;
}

export interface MoraDestacada {
  proyecto: ProyectoInforme;
  cliente: string;
  /** Cliente de la tabla `cartera` cuando se eligió de la lista. */
  prospect_id: string | null;
  /** Lote, manzana, cuota o mes en mora. */
  detalle: string;
  valor: number;
}

export interface AdjuntoInforme {
  name: string;
  type: string;
  dataUrl: string;
}

export type EstadoInforme = "borrador" | "enviado" | "observado" | "aprobado";

export const ESTADOS_INFORME: Record<EstadoInforme, { label: string; cls: "ok" | "warn" | "mid" | "high" | "brand"; ayuda: string }> = {
  borrador: { label: "Borrador", cls: "brand", ayuda: "En edición por el equipo de cartera" },
  enviado: { label: "Por revisar", cls: "warn", ayuda: "Enviado, pendiente de revisión" },
  observado: { label: "Con observaciones", cls: "high", ayuda: "Devuelto para corregir" },
  aprobado: { label: "Aprobado", cls: "ok", ayuda: "Revisado y cerrado" },
};

export function esEstadoInforme(v: unknown): v is EstadoInforme {
  return typeof v === "string" && v in ESTADOS_INFORME;
}

export type AccionInforme = "creado" | "guardado" | "enviado" | "aprobado" | "devuelto" | "reabierto";

export const ACCION_LABEL: Record<AccionInforme, string> = {
  creado: "Creó el informe",
  guardado: "Guardó cambios",
  enviado: "Envió a revisión",
  aprobado: "Aprobó el informe",
  devuelto: "Devolvió con observaciones",
  reabierto: "Reabrió el informe",
};

export interface EventoHistorial {
  accion: AccionInforme;
  por: string;
  por_id: string | null;
  at: string;
  nota: string | null;
}

/** Fila de la lista (sin el contenido del adjunto). */
export interface InformeResumen {
  id: string;
  periodo: string; // YYYY-MM-DD (día 1)
  estado: EstadoInforme;
  cifras: CifraProyecto[];
  separaciones: SeparacionInforme[];
  mora_destacada: MoraDestacada[];
  analisis: string | null;
  recomendaciones: string | null;
  adjunto_nombre: string | null;
  observaciones: string | null;
  historial: EventoHistorial[];
  creado_por: string | null;
  enviado_at: string | null;
  revisado_por: string | null;
  revisado_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Columnas de la lista: el dataUrl del adjunto solo se pide al abrirlo. */
export const COLUMNAS_LISTA =
  "id, periodo, estado, cifras, separaciones, mora_destacada, analisis, recomendaciones, adjunto_nombre:adjunto->>name, observaciones, historial, creado_por, enviado_at, revisado_por, revisado_at, created_at, updated_at";

// ── Periodo ─────────────────────────────────────────────────────────

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** "2026-10" o "2026-10-01" → "2026-10-01"; null si no es un mes válido. */
export function periodoDesdeMes(v: unknown): string | null {
  const m = /^(\d{4})-(\d{2})(?:-01)?$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (anio < 2020 || anio > 2100 || mes < 1 || mes > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

/** "2026-10-01" → "Octubre 2026". */
export function nombrePeriodo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(periodo);
  if (!m) return periodo;
  return `${MESES[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

// ── Cálculos ────────────────────────────────────────────────────────

export interface ResumenProyecto {
  proyecto: ProyectoInforme;
  nombre: string;
  pagado: number;
  separaciones: number;
  real: number;
  programado: number;
  mora: number;
  carteraTotal: number;
  /** real / programado; null cuando no hay programado (evita #DIV/0!). */
  cumplimiento: number | null;
  /** mora / cartera total; null cuando no hay cartera. */
  indicadorCartera: number | null;
}

export interface ResumenInforme {
  proyectos: ResumenProyecto[];
  subtotal: Omit<ResumenProyecto, "proyecto" | "nombre">;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function calcularResumen(cifras: CifraProyecto[], separaciones: SeparacionInforme[]): ResumenInforme {
  const proyectos = PROYECTOS_INFORME.map(({ id, nombre }) => {
    const c = cifras.find((x) => x.proyecto === id);
    const pagado = c?.recaudo_pagado ?? 0;
    const sep = separaciones.filter((s) => s.proyecto === id).reduce((s, x) => s + x.valor, 0);
    const real = pagado - sep;
    const programado = c?.recaudo_programado ?? 0;
    const mora = c?.mora ?? 0;
    const carteraTotal = c?.cartera_total ?? 0;
    return {
      proyecto: id, nombre, pagado, separaciones: sep, real, programado, mora, carteraTotal,
      cumplimiento: ratio(real, programado), indicadorCartera: ratio(mora, carteraTotal),
    };
  });
  const sum = (k: "pagado" | "separaciones" | "real" | "programado" | "mora" | "carteraTotal") => proyectos.reduce((s, p) => s + p[k], 0);
  const real = sum("real"), programado = sum("programado"), mora = sum("mora"), carteraTotal = sum("carteraTotal");
  return {
    proyectos,
    subtotal: {
      pagado: sum("pagado"), separaciones: sum("separaciones"), real, programado, mora, carteraTotal,
      cumplimiento: ratio(real, programado), indicadorCartera: ratio(mora, carteraTotal),
    },
  };
}

/** Qué falta para poder enviar a revisión (vacío = completo). */
export function faltantesParaEnviar(
  i: { cifras: CifraProyecto[]; separaciones: SeparacionInforme[]; analisis: string | null },
  /** Informe del mes anterior más cercano (para exigir la justificación de variaciones atípicas). */
  anterior?: Pick<InformeResumen, "periodo" | "cifras"> | null,
): string[] {
  const faltan: string[] = [];
  for (const p of PROYECTOS_INFORME) {
    if (!i.cifras.some((c) => c.proyecto === p.id)) faltan.push(`Cifras de ${p.nombre}`);
  }
  const r = calcularResumen(i.cifras, i.separaciones);
  for (const p of r.proyectos) {
    if (p.real < 0) faltan.push(`${p.nombre}: las separaciones superan el recaudo pagado`);
  }
  for (const v of carteraAtipica(i.cifras, anterior)) {
    if (!v.justificacion) {
      faltan.push(`${NOMBRE_PROYECTO[v.proyecto]}: explica por qué la cartera total cambió ${formatoVariacion(v.variacion)} frente a ${nombrePeriodo(v.periodoAnterior)}`);
    }
  }
  return faltan;
}

// ── Comparación con el informe anterior ─────────────────────────────

/** Informe más reciente ANTERIOR al periodo dado (no necesariamente el mes inmediato). */
export function informeAnterior<T extends Pick<InformeResumen, "periodo">>(informes: T[], periodo: string): T | null {
  return informes.filter((i) => i.periodo < periodo).sort((a, b) => b.periodo.localeCompare(a.periodo))[0] ?? null;
}

/** "+256 %" / "−71 %". */
export function formatoVariacion(v: number): string {
  const n = Math.round(v * 100);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} %`;
}

export interface VariacionCartera {
  proyecto: ProyectoInforme;
  anterior: number;
  actual: number;
  variacion: number;
  periodoAnterior: string;
  justificacion: string | null;
}

/** Proyectos cuya cartera total cambió más del 50 % frente al informe anterior. */
export function carteraAtipica(cifras: CifraProyecto[], anterior?: Pick<InformeResumen, "periodo" | "cifras"> | null): VariacionCartera[] {
  if (!anterior) return [];
  const out: VariacionCartera[] = [];
  for (const c of cifras) {
    const a = anterior.cifras.find((x) => x.proyecto === c.proyecto);
    const v = variacionAtipica(a?.cartera_total, c.cartera_total);
    if (a && v !== null) {
      out.push({
        proyecto: c.proyecto, anterior: a.cartera_total, actual: c.cartera_total, variacion: v,
        periodoAnterior: anterior.periodo, justificacion: c.justificacion_cartera?.trim() || null,
      });
    }
  }
  return out;
}

// ── Validación de entrada (API) ─────────────────────────────────────

const MAX_TEXTO = 8000;
const MAX_FILAS = 100;

function monto(v: unknown, campo: string): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n < 0) throw new Error(`${campo}: valor inválido`);
  if (n > 1e13) throw new Error(`${campo}: valor fuera de rango`);
  return Math.round(n * 100) / 100;
}

function texto(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

export function limpiarTextoLargo(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t ? t.slice(0, MAX_TEXTO) : null;
}

function lista(v: unknown, campo: string): Record<string, unknown>[] {
  if (!Array.isArray(v)) throw new Error(`${campo}: debe ser una lista`);
  if (v.length > MAX_FILAS) throw new Error(`${campo}: demasiadas filas`);
  return v.map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}));
}

function proyecto(v: unknown, campo: string): ProyectoInforme {
  if (!esProyectoInforme(v)) throw new Error(`${campo}: proyecto inválido`);
  return v;
}

export function limpiarCifras(v: unknown): CifraProyecto[] {
  const vistos = new Set<string>();
  return lista(v, "Cifras").map((c) => {
    const p = proyecto(c.proyecto, "Cifras");
    if (vistos.has(p)) throw new Error(`Cifras: ${NOMBRE_PROYECTO[p]} está repetido`);
    vistos.add(p);
    const n = NOMBRE_PROYECTO[p];
    return {
      proyecto: p,
      recaudo_pagado: monto(c.recaudo_pagado, `${n} · recaudo pagado`),
      recaudo_programado: monto(c.recaudo_programado, `${n} · recaudo programado`),
      mora: monto(c.mora, `${n} · cartera en mora`),
      cartera_total: monto(c.cartera_total, `${n} · cartera total`),
      justificacion_cartera: texto(c.justificacion_cartera, 600) || null,
    };
  });
}

export function limpiarSeparaciones(v: unknown): SeparacionInforme[] {
  return lista(v, "Separaciones").map((s, i) => {
    const cliente = texto(s.cliente);
    if (!cliente) throw new Error(`Separación ${i + 1}: falta el cliente`);
    return {
      proyecto: proyecto(s.proyecto, `Separación ${i + 1}`),
      cliente,
      lote: texto(s.lote, 40),
      manzana: texto(s.manzana, 40),
      valor: monto(s.valor, `Separación ${i + 1}`),
    };
  });
}

export function limpiarMoraDestacada(v: unknown): MoraDestacada[] {
  return lista(v, "Clientes en mora").map((m, i) => {
    const cliente = texto(m.cliente);
    if (!cliente) throw new Error(`Cliente en mora ${i + 1}: falta el nombre`);
    const pid = texto(m.prospect_id, 80);
    return {
      proyecto: proyecto(m.proyecto, `Cliente en mora ${i + 1}`),
      cliente,
      prospect_id: pid || null,
      detalle: texto(m.detalle, 300),
      valor: monto(m.valor, `Cliente en mora ${i + 1}`),
    };
  });
}

// ── Avisos de pendientes ────────────────────────────────────────────

/** Evento de ventana que se emite al crear, enviar o revisar un informe (refresca el contador del menú). */
export const EVENTO_INFORMES = "ag:informes-cartera-cambiaron";

export interface PendientesInformes {
  puedeRevisar: boolean;
  porRevisar: { id: string; periodo: string }[];
  conObservaciones: { id: string; periodo: string }[];
}

/** Lo que le toca a cada quien: quien revisa, los enviados; el equipo de cartera, los devueltos. */
export function pendientesDeUsuario(p: PendientesInformes): { n: number; texto: string } {
  if (p.puedeRevisar) {
    const n = p.porRevisar.length;
    return { n, texto: n === 1 ? "1 informe de cartera por revisar" : `${n} informes de cartera por revisar` };
  }
  const n = p.conObservaciones.length;
  return { n, texto: n === 1 ? "1 informe de cartera con observaciones" : `${n} informes de cartera con observaciones` };
}

// ── Cuadro anual (equivalente al «Cuadro control de recaudo y mora») ─

export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export interface MesCuadro {
  mes: number; // 1..12
  periodo: string; // YYYY-MM-01
  informe: Pick<InformeResumen, "id" | "estado"> | null;
  resumen: ResumenInforme | null;
}

export interface CuadroAnual {
  anio: number;
  meses: MesCuadro[];
  /** Recaudo real / programado acumulados; null después del último mes con informe. */
  acumuladoReal: (number | null)[];
  acumuladoProgramado: (number | null)[];
  mesesConInforme: number;
  totalReal: number;
  totalProgramado: number;
  /** Promedio mensual sobre los meses CON informe (no sobre 12). */
  promedioReal: number | null;
  cumplimientoAnio: number | null;
}

/**
 * Arma el cuadro del año a partir de los informes. Con `soloAprobados`,
 * los meses sin aprobar quedan vacíos (cifras oficiales).
 */
export function construirCuadroAnual(
  informes: Pick<InformeResumen, "id" | "periodo" | "estado" | "cifras" | "separaciones">[],
  anio: number,
  soloAprobados = false,
): CuadroAnual {
  const meses: MesCuadro[] = Array.from({ length: 12 }, (_, k) => {
    const periodo = `${anio}-${String(k + 1).padStart(2, "0")}-01`;
    const inf = informes.find((i) => i.periodo === periodo && (!soloAprobados || i.estado === "aprobado")) ?? null;
    return {
      mes: k + 1,
      periodo,
      informe: inf ? { id: inf.id, estado: inf.estado } : null,
      resumen: inf ? calcularResumen(inf.cifras, inf.separaciones) : null,
    };
  });
  const ultimo = meses.reduce((u, m, k) => (m.resumen ? k : u), -1);
  let r = 0, p = 0;
  const acumuladoReal: (number | null)[] = [];
  const acumuladoProgramado: (number | null)[] = [];
  meses.forEach((m, k) => {
    r += m.resumen?.subtotal.real ?? 0;
    p += m.resumen?.subtotal.programado ?? 0;
    acumuladoReal.push(k <= ultimo ? r : null);
    acumuladoProgramado.push(k <= ultimo ? p : null);
  });
  const conInforme = meses.filter((m) => m.resumen).length;
  return {
    anio,
    meses,
    acumuladoReal,
    acumuladoProgramado,
    mesesConInforme: conInforme,
    totalReal: r,
    totalProgramado: p,
    promedioReal: conInforme ? r / conInforme : null,
    cumplimientoAnio: p > 0 ? r / p : null,
  };
}

/**
 * Variación atípica frente al mes anterior (p. ej. una cartera total que se
 * triplica y al mes siguiente vuelve a su nivel). Devuelve la variación
 * relativa cuando supera el umbral; null si es normal o no hay base.
 */
export function variacionAtipica(anterior: number | null | undefined, actual: number | null | undefined, umbral = 0.5): number | null {
  if (anterior == null || actual == null || anterior <= 0) return null;
  const v = (actual - anterior) / anterior;
  return Math.abs(v) > umbral ? v : null;
}
