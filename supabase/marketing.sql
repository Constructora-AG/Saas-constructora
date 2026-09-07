-- ════════════════════════════════════════════════════════════════════════════
--  Módulo Marketing y Gestión de Leads — espejo de Smarthome en Supabase
--  Se llena con /api/marketing/sync (cron diario + botón "Actualizar" en la UI).
--  Idempotente: se puede aplicar varias veces.
--    npx tsx scripts/aplicar-sql.ts supabase/marketing.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── Leads digitales (getDigitalRecords): un registro por contacto entrante ───
-- Incluye el anuncio/creativo de Meta que originó el lead (click-to-WhatsApp o
-- Lead Ads) y las respuestas del formulario de precalificación.
create table if not exists mk_leads (
  id                text primary key,            -- Id del registro digital
  prospect_id       text,
  customer_id       text,
  proyecto          text not null default '',
  canal             text not null default '',    -- WhatsApp | Facebook Leads Ad | Instagram | Página Web
  medio             text not null default '',    -- fb | ig | '' (Medium)
  campana           text not null default '',    -- Campaign / [x].campaign
  ad_id             text not null default '',    -- [x].source id (CTWA) o [x].ad id (Lead Ads)
  ad_titulo         text not null default '',    -- [x].headline
  ad_tipo           text not null default '',    -- video | image | ''
  ad_url            text not null default '',    -- [x].video url / source url
  ad_miniatura      text not null default '',    -- [x].thumbnail url
  formulario        text not null default '',    -- [x].form name (Lead Ads)
  asesor            text not null default '',    -- Owner canónico
  asesor_raw        text,
  fecha_creacion    timestamptz,
  primera_accion    timestamptz,                 -- FirstActionDate (suele ser el bot)
  horas_primera_accion numeric(10,2),
  ciclo             text not null default '',
  etapa             text not null default '',
  probabilidad      int not null default 0,
  es_venta          boolean not null default false,
  es_unico          boolean not null default true,   -- IsUniqueRecord
  cliente_existente boolean not null default false,  -- IsExistingCustomer
  fecha_cierre      timestamptz,
  -- Respuestas del formulario / bot (normalizadas a texto corto)
  credito_aprobado  text not null default '',    -- Sí | No | ''
  empleo            text not null default '',    -- Empleado | Independiente | ''
  reportado         text not null default '',    -- Sí | No | No lo sé | ''
  capacidad_pago    text not null default '',
  motivacion        text not null default '',
  tiempo_compra     text not null default '',
  synced_at         timestamptz not null default now()
);
create index if not exists mk_leads_fecha_idx     on mk_leads (fecha_creacion);
create index if not exists mk_leads_proyecto_idx  on mk_leads (proyecto);
create index if not exists mk_leads_prospect_idx  on mk_leads (prospect_id);
create index if not exists mk_leads_ad_idx        on mk_leads (ad_id);

-- ── Prospectos enriquecidos: demografía + estado de seguimiento ──────────────
-- Se amplía la tabla espejo existente (sh_prospectos) con lo que trae
-- getProspectDetail. El sync de vendedores sigue funcionando igual.
alter table sh_prospectos
  add column if not exists nombre          text,
  add column if not exists genero          text,
  add column if not exists edad            int,
  add column if not exists fecha_nacimiento date,
  add column if not exists ocupacion       text,
  add column if not exists profesion       text,
  add column if not exists cargo           text,
  add column if not exists empresa         text,
  add column if not exists barrio          text,
  add column if not exists ciudad          text,
  add column if not exists estado_civil    text,
  add column if not exists tipo_cliente    int,
  add column if not exists fuente          text,        -- Fuente_de_Ubicacion_Prospecto
  add column if not exists probabilidad    int,
  add column if not exists fecha_cierre    timestamptz,
  add column if not exists seguimiento     int,         -- 0 inactivo (gris) | 1 activo (verde) | 3 vencido (rojo)
  add column if not exists estado_credito  text,
  add column if not exists score           int,
  add column if not exists digital         boolean,
  add column if not exists campana         text,
  add column if not exists medio           text,
  add column if not exists medio_atencion  text,
  add column if not exists visita_sala     int,
  add column if not exists reportado       text,
  add column if not exists sisben          text,
  add column if not exists acciones        int not null default 0,  -- suma de "Accion: *" (llamadas, WhatsApp, visitas…)
  add column if not exists acciones_detalle jsonb;

create index if not exists sh_prospectos_proyecto_idx on sh_prospectos (proyecto);
create index if not exists sh_prospectos_seguimiento_idx on sh_prospectos (seguimiento);

-- ── Inversión publicitaria (captura manual: Meta Ads) para calcular CPA ──────
create table if not exists mk_inversion (
  id         uuid primary key default gen_random_uuid(),
  mes        text not null,                     -- 'YYYY-MM'
  proyecto   text not null default '',          -- '' = todos
  canal      text not null default '',          -- '' = todos | Facebook | Instagram | WhatsApp
  monto      numeric(16,2) not null default 0,  -- COP
  nota       text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (mes, proyecto, canal)
);

-- ── Estado del último sync (para mostrar "actualizado hace X") ───────────────
create table if not exists mk_sync_estado (
  clave       text primary key,
  ultimo_ok   timestamptz,
  detalle     jsonb
);
