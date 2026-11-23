import assert from "node:assert/strict";
import test from "node:test";

import { authorizeNamespaceValue, keyBelongsToNamespace, resolveTransporteNamespace } from "@/lib/transporte/namespace";
import {
  KEY_ADMIN,
  KEY_TARIFARIO,
  monthSizeInfo,
  monthStorageKey,
  storageFor,
  validateBackup,
  withTimeout,
} from "@/lib/transporte/storage";
import { SAVE_BLOCK_CHARS, SAVE_WARN_CHARS } from "@/lib/transporte/constants";
import type { Servicio } from "@/lib/transporte/model";

async function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function servicioConNotas(notes: string): Servicio {
  return {
    id: "s-test",
    date: "2026-11-20",
    orderNo: "RG-1",
    serviceType: "Programado",
    interventor: "Interventor",
    plate: "ABC123",
    capacity: 5,
    driver: "Conductor",
    equipment: "Equipo",
    weight: 1,
    pickup: "Origen",
    destination: "Destino",
    area: "Barranquilla",
    hourReq: "08:00",
    hourAtt: "09:00",
    value: 100,
    tolls: 0,
    photo: false,
    approved: false,
    invoiced: false,
    notes,
    photoFiles: [],
    approvalFile: null,
    tarifaCategoria: null,
    tarifaRuta: null,
  };
}

test("resolveTransporteNamespace separa módulos base y contratos dinámicos", () => {
  assert.deepEqual(resolveTransporteNamespace(undefined), { ns: "transporte", prefix: "", modulo: "transporte" });
  assert.deepEqual(resolveTransporteNamespace("transporte"), { ns: "transporte", prefix: "", modulo: "transporte" });
  assert.deepEqual(resolveTransporteNamespace("alquiler"), { ns: "alquiler", prefix: "alquiler:", modulo: "alquiler" });
  assert.deepEqual(resolveTransporteNamespace("emergencia"), { ns: "emergencia", prefix: "emergencia:", modulo: "emergencia" });
  // Recolección conserva el espacio "recoleccion:" que tenía como contrato creado en la app, ahora con su propio módulo.
  assert.deepEqual(resolveTransporteNamespace("recoleccion"), { ns: "recoleccion", prefix: "recoleccion:", modulo: "recoleccion" });
  assert.deepEqual(resolveTransporteNamespace("contrato-2026"), { ns: "contrato-2026", prefix: "contrato-2026:", modulo: "contratos" });
});

test("resolveTransporteNamespace rechaza caracteres fuera del formato de namespace", () => {
  assert.equal(resolveTransporteNamespace("Contrato 2026"), null);
  assert.equal(resolveTransporteNamespace("../alquiler"), null);
  assert.equal(resolveTransporteNamespace("alquiler/otro"), null);
  assert.equal(resolveTransporteNamespace("" )?.ns, "transporte");
});

test("keyBelongsToNamespace impide cruzar prefijos entre módulos", () => {
  const alquiler = { prefix: "alquiler:" };
  const emergencia = { prefix: "emergencia:" };
  const transporte = { prefix: "" };

  assert.equal(keyBelongsToNamespace("alquiler:services:2026-11", alquiler), true);
  assert.equal(keyBelongsToNamespace("alquiler:adminconfig", alquiler), true);
  assert.equal(keyBelongsToNamespace("emergencia:services:2026-11", alquiler), false);
  assert.equal(keyBelongsToNamespace("services:2026-11", transporte), true);
  assert.equal(keyBelongsToNamespace("adminconfig", transporte), true);
  assert.equal(keyBelongsToNamespace("alquiler:services:2026-11", transporte), false);
  assert.equal(keyBelongsToNamespace("services:not-a-month", transporte), false);
});

test("authorizeNamespaceValue conserva el mismo resolvedor para cuerpos y adjuntos", () => {
  assert.deepEqual(authorizeNamespaceValue("alquiler"), resolveTransporteNamespace("alquiler"));
  assert.equal(authorizeNamespaceValue("namespace inválido"), null);
});

test("las claves mensuales tienen el formato aislable esperado", () => {
  assert.equal(monthStorageKey("2026-11"), "services:2026-11");
  assert.equal(monthStorageKey("2027-01"), "services:2027-01");
});

test("storageFor mantiene datos separados en modo demo", async () => {
  await withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }, async () => {
    const alquiler = storageFor("alquiler");
    const emergencia = storageFor("emergencia");
    const transporte = storageFor("transporte");

    await alquiler.kvSet(KEY_ADMIN, "alquiler-admin");
    await emergencia.kvSet(KEY_ADMIN, "emergencia-admin");
    await transporte.kvSet(KEY_TARIFARIO, "transporte-tarifario");

    assert.equal(await alquiler.kvGet(KEY_ADMIN), "alquiler-admin");
    assert.equal(await emergencia.kvGet(KEY_ADMIN), "emergencia-admin");
    assert.equal(await transporte.kvGet(KEY_ADMIN), null);
    assert.equal(await alquiler.kvGet(KEY_TARIFARIO), null);
    assert.deepEqual(await alquiler.kvList(), [KEY_ADMIN]);
    assert.deepEqual(await emergencia.kvList(), [KEY_ADMIN]);
    assert.deepEqual(await transporte.kvList(), [KEY_TARIFARIO]);
  });
});

test("validateBackup rechaza backups ajenos y cuenta claves válidas", () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup({ app: "otra-app", keys: {} }).ok, false);
  assert.equal(validateBackup({ app: "control_contrato_aaa", keys: null }).ok, false);
  const result = validateBackup({ app: "control_contrato_aaa", version: 1, generatedAt: "2026-11-20T10:00:00Z", keys: { adminconfig: "{}", "services:2026-11": "[]" } });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.blocks, 2);
});

test("monthSizeInfo respeta los umbrales de aviso y bloqueo", () => {
  const normal = monthSizeInfo([servicioConNotas("normal")]);
  assert.equal(normal.warn, false);
  assert.equal(normal.block, false);

  const warning = monthSizeInfo([servicioConNotas("x".repeat(SAVE_WARN_CHARS))]);
  assert.equal(warning.warn, true);
  assert.equal(warning.block, false);

  const blocked = monthSizeInfo([servicioConNotas("x".repeat(SAVE_BLOCK_CHARS))]);
  assert.equal(blocked.warn, true);
  assert.equal(blocked.block, true);
});

test("withTimeout resuelve a tiempo y rechaza al superar el límite", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), 50, "test"), "ok");
  await assert.rejects(withTimeout(new Promise<string>((resolve) => setTimeout(() => resolve("tarde"), 30)), 5, "lectura"), /Tiempo de espera agotado \(lectura\)/);
});

test("un contrato nuevo llamado «Contrato de Recolección» no reutiliza el espacio del módulo", async () => {
  const { idContrato, prefijoSugerido } = await import("@/lib/transporte/contratos");
  assert.equal(idContrato("Contrato de Recolección", []), "recoleccion-2");
  assert.notEqual(prefijoSugerido("Contrato de Recolección", []), "RE");
});
