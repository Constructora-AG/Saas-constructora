-- Prefacturas de contratos creados desde la app (Proyecto Triple A → Contratos).
-- El campo contrato pasa de una lista fija ('alquiler','emergencia','transporte')
-- a cualquier id de contrato (minúsculas, números y guiones). Ejecutar una vez
-- en Supabase > SQL Editor (o psql) antes de prefacturar un contrato nuevo.
alter table aaa_prefacturas drop constraint if exists aaa_prefacturas_contrato_check;
alter table aaa_prefacturas add constraint aaa_prefacturas_contrato_check
  check (contrato ~ '^[a-z0-9][a-z0-9-]{1,40}$');
