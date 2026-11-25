import assert from "node:assert/strict";
import test from "node:test";

import {
  calcularResumen,
  carteraAtipica,
  formatoVariacion,
  informeAnterior,
  construirCuadroAnual,
  variacionAtipica,
  faltantesParaEnviar,
  limpiarCifras,
  limpiarMoraDestacada,
  limpiarSeparaciones,
  nombrePeriodo,
  pendientesDeUsuario,
  periodoDesdeMes,
  type CifraProyecto,
  type SeparacionInforme,
} from "@/lib/cartera/informes";
import { moduloDeRuta, puedeVer, rutaInicial } from "@/lib/auth/modulos";

// Cifras del «Informe de Gestión de Cartera — Octubre 2026».
const OCTUBRE: CifraProyecto[] = [
  { proyecto: "cascada_real_e1", recaudo_pagado: 450_000, recaudo_programado: 450_000, mora: 0, cartera_total: 7_534_090 },
  { proyecto: "aqua_e1", recaudo_pagado: 0, recaudo_programado: 2_977_550, mora: 2_977_550, cartera_total: 2_977_550 },
  { proyecto: "aqua_e2", recaudo_pagado: 0, recaudo_programado: 0, mora: 0, cartera_total: 0 },
  { proyecto: "lotes_manantial", recaudo_pagado: 75_574_450, recaudo_programado: 49_342_621, mora: 3_100_000, cartera_total: 610_144_536 },
];
const SEPARACIONES: SeparacionInforme[] = [
  { proyecto: "lotes_manantial", cliente: "Cliente A", lote: "6", manzana: "3", valor: 500_000 },
  { proyecto: "lotes_manantial", cliente: "Cliente B", lote: "14", manzana: "4", valor: 2_000_000 },
  { proyecto: "lotes_manantial", cliente: "Cliente C", lote: "19", manzana: "4", valor: 1_400_000 },
];

test("el resumen reproduce los totales del informe de octubre", () => {
  const r = calcularResumen(OCTUBRE, SEPARACIONES);
  const lotes = r.proyectos.find((p) => p.proyecto === "lotes_manantial")!;
  assert.equal(lotes.separaciones, 3_900_000);
  assert.equal(lotes.real, 71_674_450);
  assert.equal(lotes.cumplimiento!.toFixed(4), "1.4526");
  assert.equal(r.subtotal.real, 72_124_450);
  assert.equal(r.subtotal.programado, 52_770_171);
  assert.equal(r.subtotal.mora, 6_077_550);
  assert.equal(r.subtotal.carteraTotal, 620_656_176);
  assert.equal(r.subtotal.cumplimiento!.toFixed(4), "1.3668");
  assert.equal(r.subtotal.indicadorCartera!.toFixed(4), "0.0098");
});

test("sin base no hay división por cero (#DIV/0!)", () => {
  const r = calcularResumen(OCTUBRE, []);
  const aqua2 = r.proyectos.find((p) => p.proyecto === "aqua_e2")!;
  assert.equal(aqua2.cumplimiento, null);
  assert.equal(aqua2.indicadorCartera, null);
  assert.equal(calcularResumen([], []).subtotal.cumplimiento, null);
});

test("para enviar se exigen los cuatro proyectos; el análisis es opcional", () => {
  assert.deepEqual(faltantesParaEnviar({ cifras: OCTUBRE, separaciones: SEPARACIONES, analisis: "Ok" }), []);
  const f = faltantesParaEnviar({ cifras: OCTUBRE.slice(0, 2), separaciones: [], analisis: " " });
  assert.ok(f.includes("Cifras de Aqua Etapa 2"));
  assert.ok(f.includes("Cifras de Lotes Reserva del Manantial"));
  assert.ok(!f.includes("Análisis del mes")); // el análisis es opcional (puede ir en la presentación adjunta)
  const negativo = faltantesParaEnviar({
    cifras: OCTUBRE,
    separaciones: [{ ...SEPARACIONES[0], proyecto: "cascada_real_e1", valor: 1_000_000 }],
    analisis: "Ok",
  });
  assert.equal(negativo.length, 1);
});

test("la validación rechaza proyectos inventados, repetidos y valores negativos", () => {
  assert.equal(limpiarCifras(OCTUBRE).length, 4);
  assert.throws(() => limpiarCifras([{ ...OCTUBRE[0], proyecto: "otro" }]), /proyecto inválido/);
  assert.throws(() => limpiarCifras([OCTUBRE[0], OCTUBRE[0]]), /repetido/);
  assert.throws(() => limpiarCifras([{ ...OCTUBRE[0], mora: -1 }]), /valor inválido/);
  assert.throws(() => limpiarCifras("x"), /lista/);
  assert.throws(() => limpiarSeparaciones([{ proyecto: "aqua_e1", cliente: "", valor: 1 }]), /falta el cliente/);
  assert.deepEqual(
    limpiarMoraDestacada([{ proyecto: "lotes_manantial", cliente: " Ana ", prospect_id: "", detalle: "Lote 1", valor: "600000" }]),
    [{ proyecto: "lotes_manantial", cliente: "Ana", prospect_id: null, detalle: "Lote 1", valor: 600_000 }],
  );
});

test("periodo mensual", () => {
  assert.equal(periodoDesdeMes("2026-10"), "2026-10-01");
  assert.equal(periodoDesdeMes("2026-10-01"), "2026-10-01");
  assert.equal(periodoDesdeMes("2026-13"), null);
  assert.equal(periodoDesdeMes("2026-10-15"), null);
  assert.equal(nombrePeriodo("2026-10-01"), "Octubre 2026");
});

test("el permiso de revisión no bloquea la ruta ni cambia la página de inicio", () => {
  assert.equal(moduloDeRuta("/cartera")?.id, "cartera");
  assert.equal(puedeVer({ rol: "operacion", modulos: [] }, "cartera_revision"), false);
  assert.equal(puedeVer({ rol: "operacion", modulos: ["cartera_revision"] }, "cartera_revision"), true);
  assert.equal(puedeVer({ rol: "superadmin", modulos: [] }, "cartera_revision"), true);
  assert.equal(rutaInicial({ rol: "comercial", modulos: ["cartera_revision"] }), "/marketing");
});

test("el contador de pendientes depende de quién mira", () => {
  const p = {
    puedeRevisar: true,
    porRevisar: [{ id: "a", periodo: "2026-10-01" }, { id: "b", periodo: "2026-09-01" }],
    conObservaciones: [{ id: "c", periodo: "2026-08-01" }],
  };
  assert.deepEqual(pendientesDeUsuario(p), { n: 2, texto: "2 informes de cartera por revisar" });
  assert.deepEqual(pendientesDeUsuario({ ...p, puedeRevisar: false, porRevisar: [] }), { n: 1, texto: "1 informe de cartera con observaciones" });
  assert.equal(pendientesDeUsuario({ puedeRevisar: false, porRevisar: [], conObservaciones: [] }).n, 0);
});

test("el cuadro anual reproduce acumulados del Excel y promedia sobre meses con informe", () => {
  // Subtotales reales y programados enero–octubre 2026 del «Cuadro control de recaudo y mora».
  const real = [11_550_055, 20_318_536, 34_690_265, 74_164_254, 84_808_377, 82_608_578, 77_210_754, 77_128_718, 89_292_805, 72_124_450];
  const prog = [14_344_278, 29_301_399, 29_216_830, 67_254_899, 65_601_255, 67_107_296, 74_021_386, 66_549_863, 84_573_118, 52_770_171];
  const informes = real.map((r, k) => ({
    id: String(k),
    periodo: `2026-${String(k + 1).padStart(2, "0")}-01`,
    estado: (k === 9 ? "enviado" : "aprobado") as "enviado" | "aprobado",
    cifras: [{ proyecto: "lotes_manantial" as const, recaudo_pagado: r, recaudo_programado: prog[k], mora: 0, cartera_total: 1 }],
    separaciones: [],
  }));
  const c = construirCuadroAnual(informes, 2026);
  assert.equal(c.acumuladoReal[9], 623_896_792);
  assert.equal(c.acumuladoProgramado[9], 550_740_495);
  assert.equal(c.acumuladoReal[10], null); // después del último informe no se repite el acumulado
  assert.equal(c.mesesConInforme, 10);
  assert.equal(Math.round(c.promedioReal!), 62_389_679); // no 51.991.399 (÷12)
  assert.equal(c.meses[0].resumen!.subtotal.cumplimiento!.toFixed(4), "0.8052"); // 80,52 % de enero
  const oficiales = construirCuadroAnual(informes, 2026, true);
  assert.equal(oficiales.mesesConInforme, 9); // octubre aún no está aprobado
});

test("variación atípica: la cartera total de Aqua E1 en mayo salta a la vista", () => {
  assert.ok(variacionAtipica(92_795_198, 330_092_363)! > 2.5);
  assert.ok(variacionAtipica(330_092_363, 94_871_310)! < -0.7);
  assert.equal(variacionAtipica(148_222_825, 92_795_198), null); // −37 %: dentro del umbral
  assert.equal(variacionAtipica(0, 5), null);
});

test("la cartera total atípica exige explicación para enviar", () => {
  const abril = { periodo: "2026-04-01", cifras: [{ proyecto: "aqua_e1" as const, recaudo_pagado: 0, recaudo_programado: 0, mora: 0, cartera_total: 92_795_198 }] };
  const mayo = [
    ...OCTUBRE.filter((c) => c.proyecto !== "aqua_e1"),
    { proyecto: "aqua_e1" as const, recaudo_pagado: 8_270_008, recaudo_programado: 2_903_076, mora: 2_356_926, cartera_total: 330_092_363 },
  ];
  const v = carteraAtipica(mayo, abril);
  assert.equal(v.length, 1);
  assert.equal(formatoVariacion(v[0].variacion), "+256 %");
  const faltan = faltantesParaEnviar({ cifras: mayo, separaciones: [], analisis: "Ok" }, abril);
  assert.ok(faltan.some((f) => f.includes("Aqua Etapa 1") && f.includes("+256 %") && f.includes("Abril 2026")));
  // Con la explicación ya no falta nada.
  const conExplicacion = mayo.map((c) => (c.proyecto === "aqua_e1" ? { ...c, justificacion_cartera: "Error de digitación corregido en junio" } : c));
  assert.deepEqual(faltantesParaEnviar({ cifras: conExplicacion, separaciones: [], analisis: "Ok" }, abril), []);
  // Sin informe anterior no se exige nada; variaciones de −37 % no son atípicas.
  assert.deepEqual(faltantesParaEnviar({ cifras: mayo, separaciones: [], analisis: "Ok" }, null), []);
  assert.equal(formatoVariacion(-0.7118), "−71 %");
});

test("el informe anterior es el más reciente antes del periodo, aunque falten meses", () => {
  const xs = [{ periodo: "2026-06-01" }, { periodo: "2026-08-01" }, { periodo: "2026-10-01" }];
  assert.equal(informeAnterior(xs, "2026-10-01")?.periodo, "2026-08-01");
  assert.equal(informeAnterior(xs, "2026-07-01")?.periodo, "2026-06-01");
  assert.equal(informeAnterior(xs, "2026-06-01"), null);
});
