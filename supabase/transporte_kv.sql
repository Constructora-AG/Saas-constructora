-- ════════════════════════════════════════════════════════════════════════════
--  Control Transporte AAA — almacenamiento clave-valor
--  Reemplaza la Firebase RTDB del panel original (public/transporte-aaa.html).
--  Claves: 'adminconfig', 'tarifario', 'services:AAAA-MM' (una por mes de la
--  vigencia). El valor es SIEMPRE un string JSON (mismo contrato que el
--  window.storage original). Ejecutar en Supabase > SQL Editor.
--  Migración de datos reales: scripts/migrar-transporte.ts
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists transporte_kv (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

-- Mantener updated_at al día en cada upsert.
create or replace function transporte_kv_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists transporte_kv_touch on transporte_kv;
create trigger transporte_kv_touch
  before update on transporte_kv
  for each row execute function transporte_kv_touch();
