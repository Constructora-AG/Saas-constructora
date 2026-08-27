// Mapa de proyectos de Constructora Anaya Giraldo S.A.S.
// - code:        projectCode corto (hex) -> usado en /api/v1
// - encryptedId: ProjectId encriptado    -> usado SOLO en /api/leadForm y Smart Inmobiliario
//
// "Lotes Reservas del Manantial" aún no tiene projectCode (pendiente "Generar" en el portal).

export interface ProjectRef {
  name: string;
  code: string | null;
  encryptedId: string;
}

// Solo los proyectos activos que la constructora gestiona hoy.
export const PROJECTS: ProjectRef[] = [
  { name: "Aqua Club Residencial", code: "3e7aa5be", encryptedId: "f4lDqo57J4R/AJGW0b4SCm9JLQ1MRp1z3l2VQlcvrowfj0P/RmthzBgxi1Js8UMW" },
  { name: "Lotes Reservas del Manantial", code: "62d19250", encryptedId: "Jfu27K0-XC-GcbFuH6Gk9akQ2UasRekBeWPhU/p3/Kcf53dZLTusfebhD75ZUitB" },
];

export function projectByCode(code: string): ProjectRef | undefined {
  return PROJECTS.find((p) => p.code === code);
}

export function projectByName(name: string): ProjectRef | undefined {
  return PROJECTS.find((p) => p.name.toLowerCase() === name.toLowerCase());
}
