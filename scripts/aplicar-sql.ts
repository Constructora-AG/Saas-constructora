// Aplica archivos .sql de supabase/ directamente a la base del proyecto.
// Uso: npx tsx scripts/aplicar-sql.ts supabase/usuarios.sql supabase/transporte_kv.sql
// Requiere SUPABASE_DB_PASSWORD y NEXT_PUBLIC_SUPABASE_URL en .env.local.
import { readFileSync } from "node:fs";
import { Client } from "pg";

function env(name: string): string {
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith(name + "="));
  if (!line) throw new Error(`Falta ${name} en .env.local`);
  return line.slice(name.length + 1).trim();
}

const ref = env("NEXT_PUBLIC_SUPABASE_URL").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!ref) throw new Error("No pude extraer el ref del proyecto de NEXT_PUBLIC_SUPABASE_URL");
const password = env("SUPABASE_DB_PASSWORD");

// Candidatos de conexión: directa (IPv6) y pooler por región (IPv4).
const regiones = ["us-east-1", "us-east-2", "us-west-1", "sa-east-1", "us-west-2"];
const candidatos = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...regiones.map((r) => ({ host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` })),
  ...regiones.map((r) => ({ host: `aws-1-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` })),
];

async function conectar(): Promise<Client> {
  for (const c of candidatos) {
    const client = new Client({
      host: c.host,
      port: c.port,
      user: c.user,
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      console.log(`Conectado vía ${c.host}`);
      return client;
    } catch (e) {
      console.log(`No conectó ${c.host}: ${(e as Error).message}`);
      try { await client.end(); } catch {}
    }
  }
  throw new Error("Ninguna vía de conexión funcionó");
}

async function main() {
  const archivos = process.argv.slice(2);
  if (!archivos.length) throw new Error("Indica al menos un archivo .sql");

  const client = await conectar();
  for (const archivo of archivos) {
    const sql = readFileSync(archivo, "utf8");
    console.log(`\n→ Ejecutando ${archivo}…`);
    await client.query(sql);
    console.log(`✓ ${archivo} aplicado`);
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
