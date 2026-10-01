// Carga ÚNICA de la «Conciliación de volquetas» en Otro Sí / Emergencia
// (espacio de datos "emergencia:" de transporte_kv), con la misma lógica que el
// botón «Importar conciliación de volquetas (Excel)» (lib/transporte/conciliacion).
//
// Uso:
//   npx tsx scripts/cargar-conciliacion-emergencia.ts "<archivo.xlsx>" > carga.sql
//   (luego ejecutar carga.sql con psql contra la base de producción)
//
// El SQL, en UNA transacción:
//   - reemplaza emergencia:services:AAAA-MM de los meses con filas, quitando los
//     registros creados desde facturas AGF (los demás registros se conservan);
//   - quita los registros AGF de los demás meses de emergencia;
//   - escribe el tarifario por hora del módulo;
//   - adelanta contractStart a la primera fecha y agrega las áreas B2B / B2G.
// No toca Transporte AAA ni Contrato de Alquiler.

import { readFileSync } from "node:fs";
import { leerConciliacion, registroConciliacion } from "../lib/transporte/conciliacion";
import { TARIFARIO_EMERGENCIA_DEFAULT, ZONAS_EMERGENCIA } from "../lib/transporte/constants";
import type { Servicio } from "../lib/transporte/model";

const archivo = process.argv[2];
if (!archivo) throw new Error("Falta la ruta del Excel de conciliación.");

const buf = readFileSync(archivo);
const filas = leerConciliacion(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.placa.localeCompare(b.placa));

const porMes = new Map<string, Servicio[]>();
let n = 0;
for (const f of filas) {
  const s = registroConciliacion(f, `EM${String(++n).padStart(4, "0")}`, TARIFARIO_EMERGENCIA_DEFAULT);
  if (!s) throw new Error(`Grupo sin tarifa: ${f.grupo} (${f.fecha} ${f.placa})`);
  const mk = f.fecha.slice(0, 7);
  porMes.set(mk, [...(porMes.get(mk) ?? []), s]);
}

const lit = (v: string) => `$json$${v}$json$`;
const sql: string[] = ["begin;"];
for (const [mk, nuevos] of porMes) {
  const key = `emergencia:services:${mk}`;
  sql.push(
    `insert into transporte_kv (key, value, updated_at) values ('${key}', ` +
      `((select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(coalesce((select value::jsonb from transporte_kv where key = '${key}'), '[]'::jsonb)) e where not (e ? 'facturaAGF') and not (e ? 'conciliacion'))::jsonb || ${lit(JSON.stringify(nuevos))}::jsonb)::text, now()) ` +
      `on conflict (key) do update set value = excluded.value, updated_at = now();`,
  );
}
// Meses de emergencia sin filas de conciliación: solo se quitan los registros AGF.
const meses = [...porMes.keys()].map((m) => `'emergencia:services:${m}'`).join(", ");
sql.push(
  `update transporte_kv set value = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(value::jsonb) e where not (e ? 'facturaAGF'))::text, updated_at = now() ` +
    `where key like 'emergencia:services:%' and key not in (${meses}) and value::jsonb @? '$[*] ? (exists(@.facturaAGF))';`,
);
sql.push(
  `insert into transporte_kv (key, value, updated_at) values ('emergencia:tarifario', ${lit(JSON.stringify(TARIFARIO_EMERGENCIA_DEFAULT))}, now()) ` +
    `on conflict (key) do update set value = excluded.value, updated_at = now();`,
);
const primera = filas[0]?.fecha;
const areas = JSON.stringify(ZONAS_EMERGENCIA);
sql.push(
  `update transporte_kv set value = jsonb_set(jsonb_set(value::jsonb, '{contractStart}', to_jsonb(least(coalesce(nullif(value::jsonb->>'contractStart', ''), '${primera}'), '${primera}'))), ` +
    `'{areas}', (select jsonb_agg(distinct a) from jsonb_array_elements_text(${lit(areas)}::jsonb || coalesce(value::jsonb->'areas', '[]'::jsonb)) a))::text, updated_at = now() ` +
    `where key = 'emergencia:adminconfig';`,
);
sql.push("commit;");

const total = [...porMes.values()].flat();
console.error(
  `Registros: ${total.length} · horas: ${total.reduce((a, s) => a + Number(s.horasMaquina), 0)} · ` +
    `valor con IVA: ${total.reduce((a, s) => a + Number(s.value) + Number(s.valorIva), 0)} · meses: ${[...porMes.keys()].join(", ")}`,
);
console.log(sql.join("\n"));
