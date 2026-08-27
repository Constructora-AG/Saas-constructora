-- ════════════════════════════════════════════════════════════════════════════
--  Proyecto Triple A — registro de prefacturas
--  Trabajo ya ejecutado (y pagado por AG) que aún no tiene orden de facturación.
--  Las registra el coordinador del proyecto DIRECTAMENTE en la app; los ítems
--  usan los nombres EXACTOS de Herpro (catálogo en lib/aaa/catalogo.ts) para
--  que crucen con los centros de costos AAA / AAA facturación.
--  Ejecutar en Supabase > SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists aaa_prefacturas (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null,             -- ej. "29-1"
  contrato         text not null check (contrato in ('alquiler', 'emergencia')),
  fecha_generacion date not null,             -- fecha de generación de la prefactura
  fecha_vencimiento date,                     -- vencimiento indicado en la prefactura
  centro_costo     text,                      -- centro de costo en Triple A, ej. "MANTENIMIENTO", "ASEO"
  periodo          text,                      -- ej. "21 al 25 de julio"
  lugar            text,                      -- ej. "POCITOS"
  -- items: [{ item, maquina, unidad, cantidad, vr_unit, valor_base }]
  -- "item" debe ser un nombre del catálogo Herpro del contrato.
  items            jsonb not null default '[]'::jsonb,
  valor_base       numeric(16,2) not null,    -- suma de items sin IVA
  -- en_conciliacion → conciliando con Triple A, sin orden de facturación
  -- con_orden       → Triple A emitió orden de facturación
  -- facturada       → factura emitida (sale del pendiente)
  -- pagada          → Triple A pagó la factura
  -- rechazada       → Triple A la rechazó (se corrige y se re-registra)
  estado           text not null default 'en_conciliacion'
                   check (estado in ('en_conciliacion', 'con_orden', 'facturada', 'pagada', 'rechazada')),
  numero_factura   text,
  fecha_factura    date,
  nota             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists aaa_prefacturas_numero_idx on aaa_prefacturas (numero);
create index if not exists aaa_prefacturas_estado_idx on aaa_prefacturas (estado);

create or replace function fn_touch_aaa_prefactura() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_aaa_prefactura on aaa_prefacturas;
create trigger trg_touch_aaa_prefactura before update on aaa_prefacturas
  for each row execute function fn_touch_aaa_prefactura();
