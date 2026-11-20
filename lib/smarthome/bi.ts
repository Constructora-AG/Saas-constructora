// Endpoints BI permitidos para el proxy /api/bi/[endpoint].
export const BI_ENDPOINTS = [
  "getProjectSummary",
  "getDigitalRecords",
  "getProspectLocationSource",
  "getProspectRecords",
  "getProspectDetail",
  "getClaimRecords",
] as const;

export type BiEndpoint = (typeof BI_ENDPOINTS)[number];
