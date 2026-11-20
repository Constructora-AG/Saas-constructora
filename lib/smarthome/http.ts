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

/** Capa HTTP común para REST, leadForm y BI de SmartHome. */
export async function callSmarthome<T>(url: string, apiKey: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(apiKey ? { ApiKey: apiKey } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new SmarthomeError(`Smarthome ${res.status} en ${url}`, res.status, url, text.slice(0, 500));
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SmarthomeError("Respuesta no-JSON", res.status, url, text.slice(0, 500));
  }
}
