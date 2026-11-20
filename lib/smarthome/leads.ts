import { projectByCode, projectByName } from "./projects";
import type { LeadInput } from "./types";

export type LeadBody = Record<string, unknown>;

/** Resuelve el ProjectId cifrado que exige el endpoint leadForm. */
export function resolveLeadProjectId(body: LeadBody): string | undefined {
  let projectId = body.projectId as string | undefined;
  if (!projectId && typeof body.projectCode === "string") {
    projectId = projectByCode(body.projectCode)?.encryptedId;
  }
  if (!projectId && typeof body.projectName === "string") {
    projectId = projectByName(body.projectName)?.encryptedId;
  }
  return projectId;
}

/** Construye el payload actual del endpoint sin llamar aún a SmartHome. */
export function buildLeadInput(body: LeadBody): { lead: LeadInput } | { error: string } {
  const projectId = resolveLeadProjectId(body);
  if (!projectId) return { error: "Falta projectId/projectCode/projectName válido" };

  const required = ["first_name", "last_name", "email", "mobile_number", "origin"] as const;
  for (const field of required) {
    if (!body[field]) return { error: `Falta campo: ${field}` };
  }

  return {
    lead: {
      first_name: String(body.first_name),
      last_name: String(body.last_name),
      email: String(body.email),
      mobile_number: String(body.mobile_number),
      origin: String(body.origin),
      comment: body.comment ? String(body.comment) : "Lead web. Habeas Data: SI.",
      projectId,
      locationSourceId: body.locationSourceId ? String(body.locationSourceId) : undefined,
      scoring: body.scoring ? String(body.scoring) : undefined,
      fieldList: Array.isArray(body.fieldList) ? (body.fieldList as LeadInput["fieldList"]) : undefined,
    },
  };
}
