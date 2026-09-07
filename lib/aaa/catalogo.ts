// Catálogo de ítems Herpro del proyecto Triple A, tomado del centro de costos
// "AAA facturación" (Control de costos V2, corte jul-2026). Las prefacturas DEBEN
// usar estos nombres exactos para que crucen con Herpro al facturarse — si el
// nombre difiere, Herpro crea un ítem nuevo y la conciliación se fragmenta.
// La tarifa es la del presupuesto contractual (sin IVA), editable al registrar.

export interface ItemCatalogo {
  item: string;      // nombre EXACTO en Herpro
  maquina: string;   // grupo / capítulo
  unidad: string;
  tarifa: number;    // tarifa contractual sin IVA
}

export const CATALOGO_ALQUILER: ItemCatalogo[] = [
  { item: "Alq excavadora sobre oruga 22 m", maquina: "Excavadora 22M", unidad: "HR", tarifa: 344500 },
  { item: "Transporte excavadora oruga 22 m bquilla", maquina: "Excavadora 22M", unidad: "VJ", tarifa: 1470000 },
  { item: "Alq excavadora 22 m municipio", maquina: "Excavadora 22M", unidad: "HR", tarifa: 370500 },
  { item: "Transporte excavadora oruga 22 m municipio", maquina: "Excavadora 22M", unidad: "VJ", tarifa: 1715000 },
  { item: "Alq excavadora sobre oruga 19 ton", maquina: "Excavadora 19Ton", unidad: "HR", tarifa: 344500 },
  { item: "Transporte excavadora oruga 19 ton bquilla", maquina: "Excavadora 19Ton", unidad: "VJ", tarifa: 1470000 },
  { item: "Alq. excavadora 19 ton municipio", maquina: "Excavadora 19Ton", unidad: "HH", tarifa: 370500 },
  { item: "Transporte excavadora oruga 19 ton municipio", maquina: "Excavadora 19Ton", unidad: "VJ", tarifa: 1715000 },
  { item: "Alquiler bulldozer bquilla aaa", maquina: "Bulldozer 22Ton", unidad: "HR", tarifa: 264000 },
  { item: "Transporte bulldozer bquilla", maquina: "Bulldozer 22Ton", unidad: "VJ", tarifa: 1470000 },
  { item: "Alq cargador pala frontal", maquina: "Cargador 12Ton", unidad: "HRA", tarifa: 206250 },
  { item: "Transporte cargador vj", maquina: "Cargador 12Ton", unidad: "VJ", tarifa: 1470000 },
  { item: "Alq minicargador bquilla aaa", maquina: "Minicargador", unidad: "HR", tarifa: 81250 },
  { item: "Transporte minicargador bq", maquina: "Minicargador", unidad: "VJ", tarifa: 676200 },
  { item: "Alq minicargador por fuera bquilla aaa", maquina: "Minicargador", unidad: "HR", tarifa: 93750 },
  { item: "Transporte minicargador municipios", maquina: "Minicargador", unidad: "VJ", tarifa: 882000 },
  { item: "Alq retroexcavadora bq", maquina: "Pajarita", unidad: "HH", tarifa: 181250 },
  { item: "Transporte pajartia bq", maquina: "Pajarita", unidad: "VJ", tarifa: 676200 },
  { item: "ALQUILER RETROCARGADOR (PAJARITA)", maquina: "Pajarita", unidad: "HRA", tarifa: 190400 },
  { item: "Transporte pajarita municipios", maquina: "Pajarita", unidad: "VJ", tarifa: 882000 },
  { item: "ALQUILER MINIEXCAVADORA X HRA", maquina: "Miniexcavadora", unidad: "HRA", tarifa: 230000 },
  { item: "Transporte miniexcavadora bq.", maquina: "Miniexcavadora", unidad: "VJ", tarifa: 676200 },
  { item: "Alq miniexcavadora municipio", maquina: "Miniexcavadora", unidad: "HRA", tarifa: 276000 },
  { item: "Transporte miniexcavadora municipio", maquina: "Miniexcavadora", unidad: "VJ", tarifa: 882000 },
];

export const CATALOGO_EMERGENCIA: ItemCatalogo[] = [
  { item: "Transporte volq dd emergencia", maquina: "Transporte emergencia", unidad: "DD", tarifa: 15905836 },
];

export function catalogoDe(contrato: string): ItemCatalogo[] {
  if (contrato === "transporte") return []; // Transporte AAA: ítems libres (uno por servicio registrado)
  return contrato === "emergencia" ? CATALOGO_EMERGENCIA : CATALOGO_ALQUILER;
}

export const CONTRATO_LABEL: Record<string, string> = { alquiler: "Alquiler", emergencia: "Emergencia", transporte: "Transporte AAA" };

export interface PrefacturaItem {
  item: string;
  maquina: string;
  unidad: string;
  cantidad: number;
  vr_unit: number;
  valor_base: number;
}

export interface PrefacturaRow {
  id: string;
  numero: string;
  contrato: "alquiler" | "emergencia" | "transporte";
  fecha_generacion: string;
  fecha_vencimiento: string | null;
  centro_costo: string | null;
  periodo: string | null;
  lugar: string | null;
  items: PrefacturaItem[];
  valor_base: number;
  /** pendiente_acta_migo → por_facturar (acta+migo) → pendiente_pago (factura adjunta) → pagada | rechazada */
  estado: string;
  numero_factura: string | null;
  fecha_factura: string | null;
  nota: string | null;
  /** Documentos cargados (base64) */
  acta?: AdjuntoPrefactura | null;
  migo?: AdjuntoPrefactura | null;
  factura?: AdjuntoPrefactura | null;
  /** Soporte obligatorio de la prefactura (distinto de la evidencia de Transporte). Sin él queda bloqueada. */
  soporte?: AdjuntoPrefactura | null;
  /** Área AAA solicitante e interventor / funcionario (listas maestras de Transporte) */
  area_aaa?: string | null;
  interventor?: string | null;
  /** Servicios de Transporte AAA incluidos (prefacturas automáticas) */
  servicios?: Array<{ monthKey: string; id: string; date?: string; plate?: string }> | null;
  /** Período del servicio (calendario) */
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdjuntoPrefactura {
  name: string;
  type: string;
  dataUrl: string;
}
