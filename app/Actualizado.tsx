import { supabaseAdmin } from "@/lib/supabase/server";

const MAX_HORAS = 36;

// Fecha de la última sincronización con Smart Home, para que un sync caído se note.
export default async function Actualizado({ tabla }: { tabla: string }) {
  let fecha: string | null = null;
  try {
    const { data } = await supabaseAdmin()
      .from(tabla)
      .select("synced_at")
      .order("synced_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    fecha = (data as { synced_at?: string } | null)?.synced_at ?? null;
  } catch {
    return null; // modo demo o tabla no disponible
  }
  if (!fecha) return null;
  const d = new Date(fecha);
  const atrasado = Date.now() - d.getTime() > MAX_HORAS * 3_600_000;
  const texto = d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });
  return (
    <p style={{ fontSize: 12, margin: "2px 0 0", color: atrasado ? "#b42318" : "var(--muted, #667085)" }}>
      {atrasado ? "⚠ Datos desactualizados · " : ""}Smart Home sincronizado: {texto}
    </p>
  );
}
