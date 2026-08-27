// Migración ÚNICA de los datos del panel de Transporte AAA:
// Firebase RTDB de producción → tabla Supabase transporte_kv.
//
// Uso (requiere las variables de Supabase en el entorno o .env.local exportado):
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrar-transporte.ts
//
// Lee TODO el nodo /agpanel de la Firebase original y upserta cada clave
// ('adminconfig', 'tarifario', 'services:AAAA-MM', …) en transporte_kv con el
// mismo formato (valor string JSON). Idempotente: re-ejecutar sobreescribe.
// Antes de correr: ejecutar supabase/transporte_kv.sql en el SQL Editor.

import { createClient } from "@supabase/supabase-js";

const FIREBASE_URL = "https://control-transporte-aaa-default-rtdb.firebaseio.com";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }
  const supa = createClient(url, key, { auth: { persistSession: false } });

  console.log("→ Leyendo Firebase:", `${FIREBASE_URL}/agpanel.json`);
  const res = await fetch(`${FIREBASE_URL}/agpanel.json`);
  if (!res.ok) throw new Error(`Firebase HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown> | null;
  if (!data) {
    console.log("El nodo /agpanel está vacío: nada que migrar.");
    return;
  }

  const rows: Array<{ key: string; value: string }> = [];
  for (const [rawKey, rawValue] of Object.entries(data)) {
    // Las claves están URL-encodeadas en Firebase (p. ej. services%3A2026-07).
    const k = decodeURIComponent(rawKey);
    // El panel guarda los valores como string JSON; si algún nodo quedó como
    // objeto, se re-serializa (mismo comportamiento tolerante del original).
    const v = typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue);
    rows.push({ key: k, value: v });
    console.log(`  · ${k} (${(v.length / 1024).toFixed(1)} KB)`);
  }

  console.log(`→ Upsert de ${rows.length} clave(s) en transporte_kv…`);
  // De a una para no exceder límites de payload con meses pesados en adjuntos.
  for (const row of rows) {
    const { error } = await supa.from("transporte_kv").upsert(row, { onConflict: "key" });
    if (error) throw new Error(`Error guardando "${row.key}": ${error.message}`);
  }

  console.log(`\nMigración completa ✅  (${rows.length} claves)`);
}

main().catch((e) => {
  console.error("\nFALLÓ ❌\n", e instanceof Error ? e.message : e);
  process.exit(1);
});
