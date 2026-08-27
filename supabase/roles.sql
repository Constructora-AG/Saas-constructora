-- ════════════════════════════════════════════════════════════════════════════
--  Roles de usuario. Smarthome no expone el rol por API, así que lo mapeamos
--  aquí (por nombre canónico). Lo no listado se asume 'ventas'.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists usuarios_rol (
  nombre  text primary key,   -- nombre canónico (canonicalAsesor)
  rol     text not null default 'ventas', -- ventas|cartera|administracion|tramite|facturacion|marketing
  email   text
);

-- Excepciones conocidas (los demás quedan en 'ventas' por defecto).
insert into usuarios_rol (nombre, rol, email) values
  ('Liliana Ospina', 'administracion', 'subgerencia@agconstructora.com.co'),
  ('Yomaira Diaz', 'cartera', 'gcartera@agconstructora.com.co'),
  ('Stefany Milena Bustillo Romero', 'tramite', 'gtramite@agconstructora.com.co'),
  ('Jesus Henriquez', 'facturacion', 'facturacion@agconstructora.com.co'),
  ('Informacion', 'marketing', 'infosmart@agconstructora.com.co')
on conflict (nombre) do update set rol = excluded.rol, email = excluded.email;

-- ── RPCs con rol (join a usuarios_rol; default 'ventas') ─────────────────────
-- Cambian su tipo de retorno (agregan rol), así que hay que recrearlas.
drop function if exists vend_prospectos(timestamptz, timestamptz);
drop function if exists vend_contactos(timestamptz, timestamptz);

create or replace function vend_prospectos(desde timestamptz, hasta timestamptz)
returns table (
  asesor text, rol text, total bigint, prospecto bigint, seguimiento bigint,
  negociacion bigint, compra bigint, valor_pipeline numeric, valor_ventas numeric
) language sql stable as $$
  select
    p.asesor,
    coalesce(u.rol, 'ventas') as rol,
    count(*) as total,
    count(*) filter (where p.etapa = 'Prospecto') as prospecto,
    count(*) filter (where p.etapa = 'Seguimiento') as seguimiento,
    count(*) filter (where p.etapa ilike 'Negociaci%') as negociacion,
    count(*) filter (where p.es_venta) as compra,
    coalesce(sum(p.valor) filter (where not p.es_venta and p.etapa not in ('Descartados','No interesado','No contactado')), 0) as valor_pipeline,
    coalesce(sum(p.valor) filter (where p.es_venta), 0) as valor_ventas
  from sh_prospectos p
  left join usuarios_rol u on u.nombre = p.asesor
  where p.asesor <> ''
    and (desde is null or p.fecha_creacion >= desde)
    and (hasta is null or p.fecha_creacion <= hasta)
  group by p.asesor, coalesce(u.rol, 'ventas')
  order by total desc;
$$;

create or replace function vend_contactos(desde timestamptz, hasta timestamptz)
returns table (asesor text, rol text, contactos bigint, whatsapp bigint)
language sql stable as $$
  select
    c.asesor,
    coalesce(u.rol, 'ventas') as rol,
    count(*) as contactos,
    count(*) filter (where c.canal ilike 'whatsapp') as whatsapp
  from sh_contactos c
  left join usuarios_rol u on u.nombre = c.asesor
  where c.asesor <> ''
    and (desde is null or c.fecha >= desde)
    and (hasta is null or c.fecha <= hasta)
  group by c.asesor, coalesce(u.rol, 'ventas')
  order by contactos desc;
$$;
