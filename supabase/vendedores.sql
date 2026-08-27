-- ════════════════════════════════════════════════════════════════════════════
--  Reporte de vendedores (solo lectura) — datos espejo de Smarthome
--  Se llena con /api/vendedores/sync. Agregación vía funciones RPC.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists sh_prospectos (
  prospect_id     text primary key,
  asesor          text not null default '',   -- canónico (normalizado)
  asesor_raw      text,
  proyecto        text,
  etapa           text,
  ciclo           text,
  valor           numeric(16,2) not null default 0,
  celular         text,
  email           text,
  fecha_creacion  timestamptz,
  es_venta        boolean not null default false,
  synced_at       timestamptz not null default now()
);
create index if not exists sh_prospectos_asesor_idx on sh_prospectos (asesor);
create index if not exists sh_prospectos_fecha_idx on sh_prospectos (fecha_creacion);

create table if not exists sh_contactos (
  id          text primary key,
  asesor      text not null default '',
  asesor_raw  text,
  proyecto    text,
  canal       text,
  prospect_id text,
  fecha       timestamptz,
  synced_at   timestamptz not null default now()
);
create index if not exists sh_contactos_asesor_idx on sh_contactos (asesor);
create index if not exists sh_contactos_fecha_idx on sh_contactos (fecha);

-- ── Agregación de pipeline / ventas / prospectos por asesor ──────────────────
create or replace function vend_prospectos(desde timestamptz, hasta timestamptz)
returns table (
  asesor text, total bigint, prospecto bigint, seguimiento bigint,
  negociacion bigint, compra bigint, valor_pipeline numeric, valor_ventas numeric
) language sql stable as $$
  select
    asesor,
    count(*) as total,
    count(*) filter (where etapa = 'Prospecto') as prospecto,
    count(*) filter (where etapa = 'Seguimiento') as seguimiento,
    count(*) filter (where etapa ilike 'Negociaci%') as negociacion,
    count(*) filter (where es_venta) as compra,
    coalesce(sum(valor) filter (where not es_venta and etapa not in ('Descartados','No interesado','No contactado')), 0) as valor_pipeline,
    coalesce(sum(valor) filter (where es_venta), 0) as valor_ventas
  from sh_prospectos
  where asesor <> ''
    and (desde is null or fecha_creacion >= desde)
    and (hasta is null or fecha_creacion <= hasta)
  group by asesor
  order by total desc;
$$;

-- ── Agregación de contactos / actividad digital por asesor ───────────────────
create or replace function vend_contactos(desde timestamptz, hasta timestamptz)
returns table (asesor text, contactos bigint, whatsapp bigint)
language sql stable as $$
  select
    asesor,
    count(*) as contactos,
    count(*) filter (where canal ilike 'whatsapp') as whatsapp
  from sh_contactos
  where asesor <> ''
    and (desde is null or fecha >= desde)
    and (hasta is null or fecha <= hasta)
  group by asesor
  order by contactos desc;
$$;
