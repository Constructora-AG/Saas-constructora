// Creación (única) de las cuentas de la plataforma: Supabase Auth + fila en
// la tabla `usuarios` con su rol. Sin registro público: este script ES el
// alta de cuentas, corre con la service_role (Auth Admin API).
//
// ANTES de correr:
//   1. Ejecutar supabase/usuarios.sql en Supabase > SQL Editor.
//   2. Reemplazar los placeholders EMAIL_PENDIENTE_* de CONFIG por los
//      correos reales (y ajustar nombres/contraseñas si hace falta).
//
// Uso (variables de Supabase en el entorno o .env.local exportado):
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/crear-usuarios.ts
//
// Idempotente: si la cuenta ya existe (mismo email) solo upserta su fila en
// `usuarios` (no cambia la contraseña).

import { createClient } from "@supabase/supabase-js";

// ── CONFIG — PONER LOS CORREOS REALES AQUÍ ─────────────────────────────────
// gerencia = administrador total de la plataforma.
const CONFIG: Array<{ email: string; nombre: string; rol: "gerencia" | "renzo" | "jesus"; password: string }> = [
  { email: "vimasaba45@gmail.com", nombre: "Gerencia", rol: "gerencia", password: process.env.PASSWORD_GERENCIA ?? "" },
];
// ───────────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }
  const pendientes = CONFIG.filter((u) => u.email.startsWith("EMAIL_PENDIENTE") || u.password.startsWith("CAMBIAR-"));
  if (pendientes.length) {
    throw new Error(
      `CONFIG sin completar (correo o contraseña placeholder): ${pendientes.map((u) => u.rol).join(", ")}. ` +
        "Edita scripts/crear-usuarios.ts antes de ejecutarlo.",
    );
  }

  const supa = createClient(url, key, { auth: { persistSession: false } });

  for (const u of CONFIG) {
    console.log(`→ ${u.rol} · ${u.email}`);
    let userId: string | null = null;

    const { data, error } = await supa.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true, // sin flujo de confirmación: las crea el admin
      user_metadata: { nombre: u.nombre, rol: u.rol },
    });
    if (error) {
      // Ya existe → localizarla y solo asegurar su fila en `usuarios`.
      const { data: lista, error: e2 } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (e2) throw new Error(`No se pudo crear ni listar usuarios: ${error.message} / ${e2.message}`);
      const existente = lista.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
      if (!existente) throw new Error(`Error creando ${u.email}: ${error.message}`);
      userId = existente.id;
      console.log("  · la cuenta ya existía; se actualiza solo su fila en `usuarios`.");
    } else {
      userId = data.user.id;
      console.log("  · cuenta de Auth creada.");
    }

    const { error: e3 } = await supa
      .from("usuarios")
      .upsert({ id: userId, email: u.email, nombre: u.nombre, rol: u.rol }, { onConflict: "id" });
    if (e3) throw new Error(`Error guardando fila de usuarios para ${u.email}: ${e3.message}`);
    console.log("  · fila en `usuarios` lista (rol " + u.rol + ").");
  }

  console.log("\nCuentas listas ✅  Ya se puede iniciar sesión en /login.");
}

main().catch((e) => {
  console.error("\nFALLÓ ❌\n", e instanceof Error ? e.message : e);
  process.exit(1);
});
