const KEY = process.env.SMARTHOME_BI_USERKEY;
const BASE = "https://manage.smart-home.com.co";

async function page(p) {
  const url = `${BASE}/api/bi/getProspectDetail/${KEY}?page=${p}&records=1000&createdDate=2015-01-01`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const txt = await res.text();
  return JSON.parse(txt);
}

const first = await page(1);
const pages = first.pages ?? 1;
const all = [...(first.records ?? [])];
for (let p = 2; p <= pages; p++) {
  const r = await page(p);
  all.push(...(r.records ?? []));
}

const counts = new Map();
for (const r of all) {
  const a = (r.Asesor ?? "").trim();
  if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
}
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log("total prospectos:", all.length, "· páginas:", pages);
console.log("asesores distintos:", sorted.length);
for (const [name, n] of sorted) console.log(`${n}\t${name}`);
