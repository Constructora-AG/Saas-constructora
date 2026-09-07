create table if not exists public.asistente_conversaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  titulo text not null default 'Nueva conversación',
  mensajes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists asistente_conv_usuario_idx on public.asistente_conversaciones (usuario_id, updated_at desc);
alter table public.asistente_conversaciones enable row level security;
grant all on public.asistente_conversaciones to service_role;

create or replace function public.asistente_consulta(q text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; s text;
begin
  s := btrim(q);
  if s !~* '^(select|with)\s' then raise exception 'Solo se permiten consultas SELECT'; end if;
  if s ~ ';' or s ~* '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|pg_sleep|set_config|dblink)\M' then
    raise exception 'Consulta no permitida (solo lectura)';
  end if;
  perform set_config('transaction_read_only', 'on', true);
  perform set_config('statement_timeout', '25000', true);
  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (' || s || ') z limit 300) t' into r;
  return r;
end $$;
revoke all on function public.asistente_consulta(text) from public, anon, authenticated;
grant execute on function public.asistente_consulta(text) to service_role;
create table if not exists public.app_config (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.app_config enable row level security;
grant all on public.app_config to service_role;
