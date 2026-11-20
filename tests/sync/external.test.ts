import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";
import { computeCartera } from "@/lib/cartera/compute";
import { mapDigitalRecord, mapProspectDetail } from "@/lib/marketing/smarthome";
import { canonicalAsesor, esVendedorReal } from "@/lib/smarthome/asesores";
import { projectByCode, projectByName } from "@/lib/smarthome/projects";
import { parseMontoEvento, parseReciboEvento } from "@/lib/sync/eventos";
import { syncAutorizado } from "@/lib/sync/auth";

function withEnv(values: Record<string, string | undefined>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function request(url: string, authorization?: string): NextRequest {
  return new NextRequest(url, authorization ? { headers: { authorization } } : undefined);
}

test("syncAutorizado acepta cron y secreto manual por Bearer o query string", () => {
  withEnv({ CRON_SECRET: "cron-secreto", CARTERA_SYNC_SECRET: "manual-secreto" }, () => {
    assert.equal(syncAutorizado(request("https://app.test/api/cartera/sync", "Bearer cron-secreto")), true);
    assert.equal(syncAutorizado(request("https://app.test/api/cartera/sync", "Bearer manual-secreto")), true);
    assert.equal(syncAutorizado(request("https://app.test/api/cartera/sync?secret=manual-secreto")), true);
  });
});

test("syncAutorizado rechaza secretos incorrectos y encabezados no confiables", () => {
  withEnv({ CRON_SECRET: "cron-secreto", CARTERA_SYNC_SECRET: "manual-secreto" }, () => {
    assert.equal(syncAutorizado(request("https://app.test/api/cartera/sync", "Bearer incorrecto")), false);
    assert.equal(syncAutorizado(request("https://app.test/api/cartera/sync?secret=incorrecto")), false);
    assert.equal(syncAutorizado(request("https://app.test/api/cartera/sync", "Bearer manual-secreto")), true);
  });
  withEnv({ CRON_SECRET: undefined, CARTERA_SYNC_SECRET: undefined }, () => {
    assert.equal(syncAutorizado(request("https://app.test/api/cartera/sync?x-vercel-cron=true")), false);
  });
});

test("los filtros de proyectos aceptan código y nombre sin alterar el catálogo", () => {
  const proyecto = projectByCode("3e7aa5be");
  assert.equal(proyecto?.name, "Aqua Club Residencial");
  assert.equal(projectByName("aqua club residencial")?.code, "3e7aa5be");
  assert.equal(projectByCode("no-existe"), undefined);
  assert.equal(projectByName("no existe"), undefined);
});

test("normalización de asesores elimina variantes y cuentas de sistema", () => {
  assert.equal(canonicalAsesor("SOLIANA 2 MONROY MERCADO"), "Soliana Monroy Mercado");
  assert.equal(canonicalAsesor("  José Pérez "), "Jose Perez");
  assert.equal(esVendedorReal("Administrador Smarthome"), false);
  assert.equal(esVendedorReal("Ventas 1"), true);
});

test("mapDigitalRecord prioriza fuentes prefijadas y normaliza valores", () => {
  const row = mapDigitalRecord({
    Id: 17,
    ProspectId: "p-1",
    Project: " Aqua Club Residencial ",
    LocationSource: "Instagram",
    Owner: "SOLIANA 2 MONROY MERCADO",
    CreationDate: "2026-11-20T10:00:00Z",
    Probability: "50",
    IsSale: 1,
    "[instagram].headline": "  Campaña noviembre  ",
    "[instagram].ad id": "ad-7",
    "[instagram].media type": "image",
    "[instagram].thumbnail url": "https://img.test/7",
    Stage: "Compra",
    SaleCycle: "Compra",
  });
  assert.equal(row.id, "17");
  assert.equal(row.proyecto, "Aqua Club Residencial");
  assert.equal(row.asesor, "Soliana Monroy Mercado");
  assert.equal(row.ad_id, "ad-7");
  assert.equal(row.ad_titulo, "Campaña noviembre");
  assert.equal(row.probabilidad, 50);
  assert.equal(row.es_venta, true);
  assert.match(String(row.synced_at), /^\d{4}-\d{2}-\d{2}T/);
});

test("mapProspectDetail conserva acciones positivas y calcula su total", () => {
  const row = mapProspectDetail({
    ProspectId: "p-2",
    Proyecto: "Aqua Club Residencial",
    Asesor: "Administrador",
    Valor_Ofertado: "250000000",
    Etapa_del_Ciclo: "Seguimiento",
    Ciclo_de_Venta: "Venta",
    "Accion: llamada": 2,
    "Accion: whatsapp": 0,
    "Accion: visita": 1,
    Ciudad: "Ciudad:",
    Edad: 36,
  });
  assert.equal(row.prospect_id, "p-2");
  assert.equal(row.asesor, "");
  assert.equal(row.valor, 250000000);
  assert.equal(row.acciones, 3);
  assert.deepEqual(row.acciones_detalle, { llamada: 2, visita: 1 });
  assert.equal(row.ciudad, null);
  assert.equal(row.edad, 36);
});

test("parseMontoEvento interpreta montos US y omite textos sin monto", () => {
  assert.equal(parseMontoEvento("Valor $600,000.00."), 600000);
  assert.equal(parseMontoEvento("Valor $500000."), 500000);
  assert.equal(parseMontoEvento("Abono registrado"), null);
  assert.equal(parseMontoEvento("Valor $abc"), null);
});

test("parseReciboEvento reconoce recibos normales y parciales", () => {
  assert.equal(parseReciboEvento("Recibo de caja No. 1373"), "1373");
  assert.equal(parseReciboEvento("recibo de caja parcial no 1384"), "1384");
  assert.equal(parseReciboEvento("sin recibo"), null);
});

test("computeCartera conserva saldos, mora y próxima cuota del plan sincronizado", () => {
  const result = computeCartera([
    {
      paymentId: "1", paymentType: 1, paymentTypeDescription: "Cuota", title: "Cuota 1",
      date: "2026-11-01", paymentAmountValue: 0, scheduledPaymentAmountValue: 100,
      isVerified: false, payments: [{ paymentId: "p1", title: "Abono", date: "2026-10-01", amountValue: 40, isVerified: true }],
    },
    {
      paymentId: "2", paymentType: 5, paymentTypeDescription: "Crédito", title: "Crédito",
      date: "2026-12-01", paymentAmountValue: 0, scheduledPaymentAmountValue: 200,
      isVerified: false, payments: [],
    },
  ], new Date("2026-11-20T12:00:00Z"));
  assert.equal(result.totalProgramado, 300);
  assert.equal(result.totalPagado, 40);
  assert.equal(result.saldo, 260);
  assert.equal(result.montoEnMora, 60);
  assert.equal(result.moraInicial, 60);
  assert.equal(result.moraCredito, 0);
  assert.equal(result.cuotasVencidas, 1);
  assert.equal(result.proximaCuotaFecha, "2026-12-01");
  assert.equal(result.proximaCuotaValor, 200);
});
