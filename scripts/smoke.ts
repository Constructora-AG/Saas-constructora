// Prueba de humo: verifica conectividad real con Smarthome.
// Uso:  SMARTHOME_BI_USERKEY=... SMARTHOME_COMPANY_CODE=1059512 npx tsx scripts/smoke.ts
// (o define las variables en tu shell / .env.local y expórtalas)

const API = process.env.SMARTHOME_API_BASE ?? "https://api.smart-home.com.co";
const BI = process.env.SMARTHOME_BI_BASE ?? "https://manage.smart-home.com.co";
const CC = process.env.SMARTHOME_COMPANY_CODE ?? "1059512";
const KEY = process.env.SMARTHOME_BI_USERKEY ?? "";

async function getJson(url: string) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${url}\n${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

async function main() {
  console.log("→ REST getCompany");
  const company = await getJson(`${API}/api/v1/getCompany/${CC}`);
  console.log("  ✓", company.company?.[0]?.name);

  console.log("→ REST getProjects");
  const projects = await getJson(`${API}/api/v1/getProjects/${CC}/`);
  console.log("  ✓", projects.project?.length, "proyectos");

  if (KEY) {
    console.log("→ BI getProjectSummary");
    const summary = await getJson(`${BI}/api/bi/getProjectSummary/${KEY}`);
    console.log("  ✓", summary.records?.length, "registros de inventario/venta");
  } else {
    console.log("→ BI: omitido (define SMARTHOME_BI_USERKEY para probarlo)");
  }

  console.log("\nTodo OK ✅");
}

main().catch((e) => {
  console.error("\nFALLÓ ❌\n", e.message);
  process.exit(1);
});
