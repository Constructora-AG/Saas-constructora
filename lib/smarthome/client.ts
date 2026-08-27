import "server-only";
import type {
  Company,
  CustomerDetail,
  LeadInput,
  PaginatedBI,
  PaymentSummaryItem,
  PaymentSummaryResponse,
  Project,
  ProjectSummaryRecord,
  ProspectDetailRecord,
  SaleRecord,
  Unit,
  V1Envelope,
} from "./types";

// ─── Configuración (desde variables de entorno, solo servidor) ───────────────

const API_BASE = process.env.SMARTHOME_API_BASE ?? "https://api.smart-home.com.co";
const BI_BASE = process.env.SMARTHOME_BI_BASE ?? "https://manage.smart-home.com.co";
const COMPANY_CODE = process.env.SMARTHOME_COMPANY_CODE ?? "";
const BI_USERKEY = process.env.SMARTHOME_BI_USERKEY ?? "";
const API_KEY = process.env.SMARTHOME_API_KEY ?? "";

export class SmarthomeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = "SmarthomeError";
  }
}

// fetch base. Node descomprime gzip automáticamente (la BI responde gzip).
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(API_KEY ? { ApiKey: API_KEY } : {}),
      ...init?.headers,
    },
    // Sin caché: el Data Cache servía respuestas viejas (stale-while-revalidate)
    // y los syncs guardaban datos desactualizados en Supabase.
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new SmarthomeError(
      `Smarthome ${res.status} en ${url}`,
      res.status,
      url,
      text.slice(0, 500),
    );
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SmarthomeError("Respuesta no-JSON", res.status, url, text.slice(0, 500));
  }
}

function requireCompany(): string {
  if (!COMPANY_CODE) throw new Error("Falta SMARTHOME_COMPANY_CODE en el entorno");
  return COMPANY_CODE;
}

// ─── API REST v1 ─────────────────────────────────────────────────────────────

export const rest = {
  async getCompany(): Promise<Company | undefined> {
    const cc = requireCompany();
    const data = await call<V1Envelope<Company>>(`${API_BASE}/api/v1/getCompany/${cc}`);
    return (data.company as Company[])?.[0];
  },

  async getProjects(): Promise<Project[]> {
    const cc = requireCompany();
    const data = await call<V1Envelope<Project>>(`${API_BASE}/api/v1/getProjects/${cc}/`);
    return (data.project as Project[]) ?? [];
  },

  async getUnits(projectCode: string): Promise<Unit[]> {
    const cc = requireCompany();
    const data = await call<V1Envelope<Unit>>(
      `${API_BASE}/api/v1/getUnits/${cc}/${projectCode}`,
    );
    return (data.units as Unit[]) ?? [];
  },

  async getLocationSources(): Promise<Array<{ locationSourceId: string; name: string }>> {
    const cc = requireCompany();
    const data = await call<V1Envelope<{ locationSourceId: string; name: string }>>(
      `${API_BASE}/api/v1/getLocationSource/${cc}`,
    );
    return (data.locationSource as Array<{ locationSourceId: string; name: string }>) ?? [];
  },

  // ── Cartera ────────────────────────────────────────────────────────────
  async getSales(projectCode: string): Promise<SaleRecord[]> {
    const cc = requireCompany();
    const data = await call<{ prospects: SaleRecord[]; returnCode?: string }>(
      `${API_BASE}/api/v1/getSales/${cc}/${projectCode}`,
    );
    return data.prospects ?? [];
  },

  async getCustomerDetail(
    projectCode: string,
    prospectId: string,
  ): Promise<CustomerDetail | undefined> {
    const cc = requireCompany();
    const data = await call<{ prospects: CustomerDetail[] }>(
      `${API_BASE}/api/v1/getCustomerDetail/${cc}/${projectCode}/${prospectId}`,
    );
    return data.prospects?.[0];
  },

  // Plan de pagos completo: cuotas esperadas vs abonos reales. Base de la cartera.
  async getPaymentSummary(
    projectCode: string,
    prospectId: string,
  ): Promise<PaymentSummaryItem[]> {
    const cc = requireCompany();
    const data = await call<PaymentSummaryResponse>(
      `${API_BASE}/api/v1/getCustomerPaymentSummary/${cc}/${projectCode}/${prospectId}`,
    );
    return data.recordsArray ?? [];
  },

  // Usuarios del sistema (para mapear userId -> nombre).
  async getUsers(): Promise<Array<{ userId: string; firstName: string; lastName: string; email: string }>> {
    const cc = requireCompany();
    const data = await call<V1Envelope<{ userId: string; firstName: string; lastName: string; email: string }>>(
      `${API_BASE}/api/v1/getUsers/${cc}`,
    );
    return (data.users as Array<{ userId: string; firstName: string; lastName: string; email: string }>) ?? [];
  },

  // Eventos/bitácora de un prospecto. eventType: 0=automático, 1=bitácora, 2=tarea.
  async getProspectEvents(projectCode: string, prospectId: string): Promise<Array<Record<string, unknown>>> {
    const cc = requireCompany();
    const data = await call<{ events?: Array<Record<string, unknown>> }>(
      `${API_BASE}/api/v1/getProspectEvents/${cc}/${projectCode}/${prospectId}`,
    );
    return data.events ?? [];
  },

  // Crear cliente (requiere API Key). Body parcial: ajusta a tu necesidad.
  async addCustomer(projectCode: string, body: Record<string, unknown>) {
    const cc = requireCompany();
    return call<V1Envelope<unknown>>(`${API_BASE}/api/v1/addCustomer/${cc}/${projectCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
};

// ─── Vincular Leads (usa el ProjectId ENCRIPTADO) ────────────────────────────

export async function addLead(lead: LeadInput) {
  return call<unknown>(`${API_BASE}/api/leadForm/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });
}

// ─── API BI (reportería) ─────────────────────────────────────────────────────

function requireUserKey(): string {
  if (!BI_USERKEY) throw new Error("Falta SMARTHOME_BI_USERKEY en el entorno");
  return BI_USERKEY;
}

export const bi = {
  async projectSummary(): Promise<ProjectSummaryRecord[]> {
    const key = requireUserKey();
    const data = await call<{ records: ProjectSummaryRecord[] }>(
      `${BI_BASE}/api/bi/getProjectSummary/${key}`,
    );
    return data.records ?? [];
  },

  // Detalle de prospectos paginado. Recorre todas las páginas si all=true.
  async prospectDetail(opts?: {
    page?: number;
    records?: number;
    createdDate?: string;
    all?: boolean;
  }): Promise<ProspectDetailRecord[]> {
    const key = requireUserKey();
    const records = opts?.records ?? 1000;
    const createdDate = opts?.createdDate ?? "2023-01-01";

    const fetchPage = (page: number) =>
      call<PaginatedBI<ProspectDetailRecord>>(
        `${BI_BASE}/api/bi/getProspectDetail/${key}?page=${page}&records=${records}&createdDate=${createdDate}`,
      );

    const first = await fetchPage(opts?.page ?? 1);
    if (!opts?.all) return first.records ?? [];

    const totalPages = first.pages ?? 1;
    const all = [...(first.records ?? [])];
    for (let p = 2; p <= totalPages; p++) {
      const next = await fetchPage(p);
      all.push(...(next.records ?? []));
    }
    return all;
  },

  // Registros digitales (contactos entrantes: WhatsApp, web, etc.). Owner = cuenta que atendió.
  async digitalRecords(records = 100000): Promise<Record<string, unknown>[]> {
    const key = requireUserKey();
    const data = await call<{ records?: Record<string, unknown>[] }>(
      `${BI_BASE}/api/bi/getDigitalRecords/${key}?page=1&records=${records}&createdDate=2015-01-01`,
    );
    return data.records ?? [];
  },

  // Genérico para los demás endpoints BI (getDigitalRecords, getProspectLocationSource,
  // getProspectRecords, getClaimRecords).
  async raw<T = unknown>(endpoint: string, query?: Record<string, string>): Promise<T> {
    const key = requireUserKey();
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    return call<T>(`${BI_BASE}/api/bi/${endpoint}/${key}${qs}`);
  },
};

// Endpoints BI permitidos (whitelist para el proxy /api/bi/[endpoint]).
export const BI_ENDPOINTS = [
  "getProjectSummary",
  "getDigitalRecords",
  "getProspectLocationSource",
  "getProspectRecords",
  "getProspectDetail",
  "getClaimRecords",
] as const;
export type BiEndpoint = (typeof BI_ENDPOINTS)[number];
