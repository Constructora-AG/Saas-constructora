// Configuración del proveedor de IA del asistente. Se guarda en app_config
// (clave 'asistente') desde el módulo Configuración IA; si no hay nada
// guardado se usan las variables de entorno. Solo se usa en el servidor.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AsistenteConfig { proveedor: string; base_url: string; modelo: string; api_key: string }

export const PROVEEDORES: Record<string, { label: string; base_url: string; modelo: string; ayuda: string }> = {
  deepseek: { label: "DeepSeek", base_url: "https://api.deepseek.com", modelo: "deepseek-chat", ayuda: "Clave en platform.deepseek.com → API Keys. Modelos: deepseek-chat (rápido) o deepseek-reasoner (razona más, más lento)." },
  openai: { label: "OpenAI", base_url: "https://api.openai.com/v1", modelo: "gpt-4.1", ayuda: "Clave en platform.openai.com → API Keys." },
  anthropic: { label: "Anthropic (Claude)", base_url: "https://api.anthropic.com/v1", modelo: "claude-sonnet-5", ayuda: "Clave en console.anthropic.com → API Keys (usa el endpoint compatible con OpenAI)." },
  otro: { label: "Otro (compatible con OpenAI)", base_url: "", modelo: "", ayuda: "Cualquier API que exponga /chat/completions con herramientas (Groq, Together, Ollama, etc.)." },
};

export async function leerConfig(supa: SupabaseClient): Promise<AsistenteConfig> {
  const { data } = await supa.from("app_config").select("valor").eq("clave", "asistente").maybeSingle();
  const v = (data?.valor ?? {}) as Partial<AsistenteConfig>;
  const proveedor = v.proveedor || "deepseek";
  const def = PROVEEDORES[proveedor] ?? PROVEEDORES.deepseek;
  return {
    proveedor,
    base_url: (v.base_url || process.env.ASISTENTE_BASE_URL || def.base_url).replace(/\/$/, ""),
    modelo: v.modelo || process.env.ASISTENTE_MODEL || def.modelo,
    api_key: v.api_key || process.env.DEEPSEEK_API_KEY || process.env.ASISTENTE_API_KEY || "",
  };
}

export const enmascarar = (k: string) => (k ? `${k.slice(0, 6)}…${k.slice(-4)}` : "");
