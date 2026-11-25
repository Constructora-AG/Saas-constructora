-- ════════════════════════════════════════════════════════════════════════════
--  Cartera — informes mensuales de gestión de cartera
--  Los sube el equipo de cartera desde /cartera, franja «Informe mensual» (formulario por
--  secciones + adjunto opcional) y los revisa quien tenga el permiso
--  «cartera_revision» (o Super admin). Solo el servidor (service_role) lee y
--  escribe: la API valida módulo, permiso y transición de estado.
--  Los subtotales e indicadores NO se guardan: se calculan al consultar
--  (lib/cartera/informes.ts) para que nunca queden desactualizados.
--  Ejecutar en Supabase > SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists cartera_informes (
  id               uuid primary key default gen_random_uuid(),
  periodo          date not null,             -- primer día del mes informado, ej. 2026-10-01
  -- borrador   → lo está llenando el equipo de cartera
  -- enviado    → pendiente de revisión
  -- observado  → devuelto con observaciones; vuelve a edición
  -- aprobado   → revisado y bloqueado
  estado           text not null default 'borrador'
                   check (estado in ('borrador', 'enviado', 'observado', 'aprobado')),
  -- cifras: [{ proyecto, recaudo_pagado, recaudo_programado, mora, cartera_total }]
  --   proyecto ∈ lista fija de lib/cartera/informes.ts (PROYECTOS_INFORME).
  --   recaudo_pagado incluye separaciones; el recaudo real se calcula restándolas.
  cifras           jsonb not null default '[]'::jsonb,
  -- separaciones eliminadas del proyectado: [{ proyecto, cliente, lote, manzana, valor }]
  separaciones     jsonb not null default '[]'::jsonb,
  -- clientes en mora destacados: [{ proyecto, cliente, prospect_id, detalle, valor }]
  mora_destacada   jsonb not null default '[]'::jsonb,
  analisis         text,
  recomendaciones  text,
  -- adjunto opcional { name, type, dataUrl } (mismo método que prefacturas, ~4 MB)
  adjunto          jsonb,
  observaciones    text,                      -- última observación del revisor
  -- historial: [{ accion, por, por_id, at, nota }]
  historial        jsonb not null default '[]'::jsonb,
  creado_por       text,
  creado_por_id    uuid,
  enviado_at       timestamptz,
  revisado_por     text,
  revisado_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint cartera_informes_periodo_mes check (extract(day from periodo) = 1)
);
create unique index if not exists cartera_informes_periodo_idx on cartera_informes (periodo);
create index if not exists cartera_informes_estado_idx on cartera_informes (estado);

create or replace function fn_touch_cartera_informe() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_cartera_informe on cartera_informes;
create trigger trg_touch_cartera_informe before update on cartera_informes
  for each row execute function fn_touch_cartera_informe();

-- Solo el servidor (service_role) lee y escribe; RLS sin políticas públicas.
alter table cartera_informes enable row level security;
