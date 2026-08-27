-- ════════════════════════════════════════════════════════════════════════════
--  Control de cartera + gestión de cobranza — Constructora Anaya Giraldo S.A.S
--  Ejecutar en Supabase > SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Cobradores (equipo de cobranza) ─────────────────────────────────────────
create table if not exists cobradores (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  email       text unique,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Snapshot de cartera (se refresca desde Smarthome vía /api/cartera/sync) ──
-- Una fila por venta (prospectId). Smarthome es la fuente de verdad de los montos.
create table if not exists cartera (
  prospect_id        text primary key,
  customer_id        text,
  project_code       text,
  project_name       text,
  module             text,            -- ej. "TORRE 5 APTO 419"
  cliente            text,
  identificacion     text,
  celular            text,            -- para wa.me
  email              text,
  total_valor        numeric(16,2) not null default 0,
  total_programado   numeric(16,2) not null default 0,
  total_pagado       numeric(16,2) not null default 0,
  saldo              numeric(16,2) not null default 0,
  cuotas_vencidas    int           not null default 0,
  monto_en_mora      numeric(16,2) not null default 0,
  mora_inicial       numeric(16,2) not null default 0, -- vencido de cuota inicial (separación + cuotas)
  mora_credito       numeric(16,2) not null default 0, -- vencido del crédito (paymentType 5)
  dias_mora          int           not null default 0,
  semaforo           text          not null default 'al_dia', -- al_dia|d1_30|d31_60|d61_90|d90_mas
  proxima_cuota_fecha date,
  proxima_cuota_valor numeric(16,2),
  synced_at          timestamptz   not null default now()
);
create index if not exists cartera_semaforo_idx on cartera (semaforo);
create index if not exists cartera_dias_mora_idx on cartera (dias_mora desc);
create index if not exists cartera_project_idx on cartera (project_code);

-- ── Estado de gestión por cliente (máquina de estados manual) ────────────────
-- Estados: sin_gestion | contactado | promesa_pago | acuerdo_pago
--          incumplido | juridico | desistido | al_dia
create table if not exists cartera_gestion (
  prospect_id        text primary key references cartera(prospect_id) on delete cascade,
  estado             text not null default 'sin_gestion',
  cobrador_id        uuid references cobradores(id),
  proxima_accion     text,
  proxima_accion_fecha date,
  ultima_gestion_at  timestamptz,
  ultimo_canal       text,            -- whatsapp | llamada | email | visita | otro
  updated_at         timestamptz not null default now()
);

-- ── Bitácora / log de gestiones (APPEND-ONLY, tiempo real) ───────────────────
-- Aquí se ve "quién está cobrando por WhatsApp": cada contacto queda registrado.
create table if not exists gestion_log (
  id                 uuid primary key default gen_random_uuid(),
  prospect_id        text not null references cartera(prospect_id) on delete cascade,
  cobrador_id        uuid references cobradores(id),
  cobrador_nombre    text,            -- desnormalizado para lectura rápida en el feed
  canal              text not null,   -- whatsapp | llamada | email | visita | sistema
  tipo               text not null,   -- contacto | cambio_estado | nota | promesa | acuerdo
  resultado          text,            -- contesto | no_contesta | numero_errado | promesa | sin_respuesta
  nota               text,
  estado_anterior    text,
  estado_nuevo       text,
  evidencia_url      text,            -- captura de pantalla (Supabase Storage)
  monto_comprometido numeric(16,2),
  fecha_compromiso   date,
  created_at         timestamptz not null default now()
);
create index if not exists gestion_log_prospect_idx on gestion_log (prospect_id, created_at desc);
create index if not exists gestion_log_cobrador_idx on gestion_log (cobrador_id, created_at desc);
create index if not exists gestion_log_canal_idx on gestion_log (canal, created_at desc);

-- ── Realtime: publicar cambios del log y la gestión ──────────────────────────
do $$ begin
  alter publication supabase_realtime add table gestion_log;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table cartera_gestion;
exception when duplicate_object then null;
end $$;

-- ── Vista de supervisión: actividad de cobro por cobrador (últimas 24h) ──────
create or replace view v_actividad_cobrador as
select
  c.id  as cobrador_id,
  c.nombre as cobrador,
  count(*) filter (where g.canal = 'whatsapp' and g.created_at > now() - interval '24 hours') as whatsapp_24h,
  count(*) filter (where g.created_at > now() - interval '24 hours') as gestiones_24h,
  count(distinct g.prospect_id) filter (where g.created_at > now() - interval '24 hours') as clientes_24h,
  max(g.created_at) as ultima_gestion
from cobradores c
left join gestion_log g on g.cobrador_id = c.id
where c.activo
group by c.id, c.nombre
order by gestiones_24h desc;

-- ── Trigger: al insertar en el log, actualizar el estado de gestión ──────────
create or replace function fn_touch_gestion() returns trigger as $$
begin
  insert into cartera_gestion (prospect_id, estado, cobrador_id, ultima_gestion_at, ultimo_canal, updated_at)
  values (
    new.prospect_id,
    coalesce(new.estado_nuevo, (select estado from cartera_gestion where prospect_id = new.prospect_id), 'contactado'),
    new.cobrador_id, new.created_at, new.canal, now()
  )
  on conflict (prospect_id) do update set
    estado            = coalesce(new.estado_nuevo, cartera_gestion.estado),
    cobrador_id       = coalesce(new.cobrador_id, cartera_gestion.cobrador_id),
    ultima_gestion_at = new.created_at,
    ultimo_canal      = new.canal,
    updated_at        = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_gestion on gestion_log;
create trigger trg_touch_gestion after insert on gestion_log
  for each row execute function fn_touch_gestion();

-- ── RLS: ajusta a tu auth. Para desarrollo, permitir lectura a anon. ─────────
-- alter table cartera enable row level security;
-- alter table gestion_log enable row level security;
-- (Define políticas según tu autenticación antes de producción.)

-- ── Cobradores semilla (opcional) ───────────────────────────────────────────
insert into cobradores (nombre, email) values
  ('Liliana Ospina', 'liliana@agconstructora.co')
on conflict (email) do nothing;
