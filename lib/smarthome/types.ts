// Tipos de respuesta de la API Smarthome (derivados de respuestas reales).
// No son exhaustivos: cubren los campos más usados. Amplíalos según necesites.

// ─── REST v1 ────────────────────────────────────────────────────────────────

export interface Company {
  companyId: string;
  name: string;
  phoneNumber: string;
  address: string;
  email: string;
  city: string;
  identificationNumber: string;
}

export interface Project {
  projectId: string;
  code: string;
  name: string;
  deliveryDate: string | null;
  deposit: number | null;
  depositPercentage: number | null;
  downpaymentPercentage: number | null;
  payments: number | null;
  description: string | null;
  latitude: number;
  longitude: number;
  website: string;
}

export interface Unit {
  moduleId: string;
  status: number; // 1 = disponible, etc.
  code: string;
  name: string;
  floor: number;
  building: string;
  unit: string;
  totalArea: number;
  privateArea: number;
  price: number;
  bedroom: number;
  bathrooms: number;
  type: string;
  modulePrice: number;
}

// Envoltorios típicos de la API v1: { <clave>: [...], returnCode, returnDesc }
export interface V1Envelope<T> {
  returnCode?: string; // "SUCCESS" | ...
  returnDesc?: string;
  serviceCode?: string | null;
  [key: string]: unknown | T[];
}

// ─── Lead ────────────────────────────────────────────────────────────────────

export interface LeadInput {
  first_name: string;
  last_name: string;
  email: string;
  mobile_number: string; // formato +57...
  origin: string; // ej. "www.tupagina.com"
  comment?: string; // incluir consentimiento Habeas Data
  projectId: string; // ProjectId ENCRIPTADO (no el code)
  locationSourceId?: string; // GUID de fuente (getLocationSource)
  moduleId?: string;
  scoring?: string;
  ip?: string;
  fieldList?: Array<{ name: string; value: string }>;
}

// ─── BI ──────────────────────────────────────────────────────────────────────

export interface ProjectSummaryRecord {
  id: number;
  project: string;
  module: string;
  unit: string;
  type: string;
  area: number;
  closeDate: string | null;
  createdDate: string;
  offerPrice: number;
  modulePrice: number;
  moduleStatus: number;
  owner: string;
  saleStatus: number;
  locationSource: string;
  probability: number;
  saleCycle: string;
  stage: string;
  totalValue: number;
}

export interface ProspectDetailRecord {
  Index: number;
  ProspectId: string;
  Proyecto: string;
  Modulo: string;
  Area: number;
  Valor_Ofertado: number;
  Nombre_del_Cliente: string;
  Email: string;
  Celular: string;
  Ciclo_de_Venta: string;
  Etapa_del_Ciclo: string;
  Fecha_de_Creacion: string;
  Asesor: string;
  Fuente_de_Ubicacion_Cliente: string;
  Probabilidad: number;
}

export interface PaginatedBI<T> {
  records: T[];
  pages?: number;
  page?: number;
}

// ─── Cartera / pagos (REST v1) ───────────────────────────────────────────────

export interface SaleRecord {
  prospectId: string;
  customerId: string;
  moduleId: string;
  projectCode: string;
  project: string;
  module: string;
  offerPrice: number;
  totalValue: number;
  deposit: number;
  downpayment?: number;
}

export interface CustomerDetail {
  prospectId: string;
  customerId: string;
  firstName: string;
  lastName: string;
  identificationNumber: string;
  email: string;
  phoneNumber: string;
  secondPhoneNumber: string;
  mobileNumber?: string;
  project: string;
  module: string;
  totalValue: number;
}

// Un abono real dentro de una cuota programada.
export interface PaymentEntry {
  paymentId: string;
  title: string;
  date: string;
  amountValue: number;
  isVerified: boolean;
}

// Una línea del plan de pagos (separación / cuota / crédito) con sus abonos.
export interface PaymentSummaryItem {
  paymentId: string;
  paymentType: number; // 0=separación, 1=cuota, 5=crédito
  paymentTypeDescription: string;
  title: string; // "cuota 01"
  date: string; // fecha programada de la cuota
  paymentAmountValue: number; // pagado hacia esta cuota
  scheduledPaymentAmountValue: number; // valor esperado de la cuota
  isVerified: boolean;
  payments: PaymentEntry[];
}

export interface PaymentSummaryResponse {
  recordsArray: PaymentSummaryItem[] | null;
  returnCode: string; // SUCCESS | NO_RECORDS | FAIL_INVALIDUSER
  returnDesc: string;
}
