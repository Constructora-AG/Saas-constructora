// ════════════════════════════════════════════════════════════════════
// Miniaturas de anuncios: Smarthome entrega URLs firmadas del CDN de
// Facebook (fbcdn) que caducan a los pocos días → en la UI salían rotas.
// Mientras el enlace está vivo (leads recientes) lo descargamos y lo
// guardamos para siempre en Storage (bucket evidencias, anuncios/<ad_id>),
// y dejamos esa URL permanente en mk_leads.ad_miniatura. Se ejecuta al
// final de cada sync y también con /api/marketing/sync?miniaturas=1.
// ════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "evidencias";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const esCdn = (u: string) => /fbcdn\.net|cdninstagram\.com/.test(u);

export async function cachearMiniaturas(supa: SupabaseClient): Promise<{ cacheadas: number; caducadas: number; reutilizadas: number }> {
  // Anuncios con miniatura aún apuntando al CDN
  const { data } = await supa.from("mk_leads").select("ad_id, ad_miniatura, fecha_creacion")
    .neq("ad_miniatura", "").neq("ad_id", "").order("fecha_creacion", { ascending: false }).limit(5000);
  const porAnuncio = new Map<string, string>();
  for (const r of data ?? []) {
    const u = String(r.ad_miniatura ?? "");
    if (!r.ad_id || !esCdn(u)) continue;
    if (!porAnuncio.has(r.ad_id as string)) porAnuncio.set(r.ad_id as string, u); // la URL más reciente de cada anuncio
  }
  // Lo que ya está en Storage
  const { data: existentes } = await supa.storage.from(BUCKET).list("anuncios", { limit: 1000 });
  const enStorage = new Set((existentes ?? []).map((o) => o.name.replace(/\.[a-z]+$/, "")));
  let cacheadas = 0, caducadas = 0, reutilizadas = 0;
  const fijar = async (adId: string, path: string) => {
    const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(path);
    await supa.from("mk_leads").update({ ad_miniatura: pub.publicUrl }).eq("ad_id", adId);
  };
  for (const [adId, url] of porAnuncio) {
    const previo = (existentes ?? []).find((o) => o.name.replace(/\.[a-z]+$/, "") === adId);
    if (previo && enStorage.has(adId)) { await fijar(adId, `anuncios/${previo.name}`); reutilizadas++; continue; }
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" }, signal: ctrl.signal });
      clearTimeout(t);
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) { caducadas++; continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
      const path = `anuncios/${adId}.${ext}`;
      const { error } = await supa.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
      if (error) { caducadas++; continue; }
      await fijar(adId, path); cacheadas++;
    } catch { caducadas++; }
  }
  return { cacheadas, caducadas, reutilizadas };
}
