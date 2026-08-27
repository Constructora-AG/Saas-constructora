-- ════════════════════════════════════════════════════════════════════════════
--  Usuarios de la plataforma (login con Supabase Auth, email + contraseña).
--  Una fila por cuenta de auth.users con su ROL de plataforma; del rol sale
--  qué ve cada quien (no hay selectores de perfil en la UI).
--    · gerencia = ADMINISTRADOR TOTAL de la plataforma (ve y puede todo).
--    · renzo / jesus = perfiles operativos de Transporte AAA; sus permisos
--      finos salen de la matriz `perms` de adminconfig (transporte_kv).
--  Las cuentas las crea el administrador (scripts/crear-usuarios.ts); no hay
--  registro público. Ejecutar en Supabase > SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists usuarios (
  id        uuid primary key references auth.users (id) on delete cascade,
  email     text unique,
  nombre    text,
  rol       text not null check (rol in ('gerencia', 'renzo', 'jesus')),
  creado_en timestamptz default now()
);

-- RLS: cada usuario autenticado lee SOLO su propio registro (la app lo usa
-- para resolver el rol de la sesión). Escrituras solo con service_role.
alter table usuarios enable row level security;

drop policy if exists "usuarios: leer propio registro" on usuarios;
create policy "usuarios: leer propio registro"
  on usuarios for select
  to authenticated
  using (auth.uid() = id);
