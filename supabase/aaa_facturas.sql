-- ════════════════════════════════════════════════════════════════════════════
--  Proyecto Triple A — registro de facturas emitidas a Triple A
--  Una fila por factura (N° AGF …) del contrato de Emergencia (Otro Sí) o del
--  Contrato de Alquiler. Se editan desde la app (sección «Facturas»).
--  Ejecutar en Supabase > SQL Editor (o: npx tsx scripts/aplicar-sql.ts supabase/aaa_facturas.sql).
--  Incluye la carga inicial de los Excel Facturas_EMERGENCIA y Facturas_ALQUILER
--  (37 + 60 facturas); es idempotente: no duplica si se corre dos veces.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists aaa_facturas (
  id           uuid primary key default gen_random_uuid(),
  contrato     text not null check (contrato in ('alquiler', 'emergencia')),
  numero       text not null,             -- ej. "AGF 606"
  fecha        date not null,             -- fecha de la factura
  concepto     text not null,
  valor_total  numeric(16,2) not null,    -- valor total de la factura (con IVA)
  nota         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists aaa_facturas_contrato_numero_idx on aaa_facturas (contrato, numero);
create index if not exists aaa_facturas_fecha_idx on aaa_facturas (contrato, fecha);

create or replace function fn_touch_aaa_factura() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_aaa_factura on aaa_facturas;
create trigger trg_touch_aaa_factura before update on aaa_facturas
  for each row execute function fn_touch_aaa_factura();

-- Solo el servidor (service_role) lee y escribe; RLS sin políticas públicas.
alter table aaa_facturas enable row level security;

insert into aaa_facturas (contrato, numero, fecha, concepto, valor_total, nota) values
  ('emergencia', 'AGF 606', '2026-07-10', 'Transporte de Residuos Especiales', 364912835.98, null),
  ('emergencia', 'AGF 609', '2026-07-10', 'Transporte de Residuos Especiales', 180568819.76, null),
  ('emergencia', 'AGF 610', '2026-07-10', 'Transporte de Residuos Especiales', 8949279.57, null),
  ('emergencia', 'AGF 611', '2026-07-10', 'Transporte de Residuos Especiales', 9109683.24, null),
  ('emergencia', 'AGF 612', '2026-07-10', 'Transporte de Residuos Especiales', 14542579.45, null),
  ('emergencia', 'AGF 613', '2026-07-10', 'Transporte de Residuos Especiales', 89710416.95, null),
  ('emergencia', 'AGF 614', '2026-07-10', 'Transporte de Residuos Especiales', 15545660.2, null),
  ('emergencia', 'AGF 615', '2026-07-10', 'Transporte de Residuos Especiales', 44543208.92, null),
  ('emergencia', 'AGF 616', '2026-07-10', 'Transporte de Residuos Especiales', 23687625.92, null),
  ('emergencia', 'AGF 617', '2026-07-10', 'Transporte de Residuos Especiales', 45680324.13, null),
  ('emergencia', 'AGF 618', '2026-07-10', 'Transporte de Residuos Especiales', 1611469.44, null),
  ('emergencia', 'AGF 619', '2026-07-18', 'Transporte de Residuos Especiales', 100688044.38, null),
  ('emergencia', 'AGF 620', '2026-07-18', 'Transporte de Residuos Especiales', 9566559.94, null),
  ('emergencia', 'AGF 621', '2026-07-18', 'Transporte de Residuos Especiales', 11745929.51, null),
  ('emergencia', 'AGF 622', '2026-07-18', 'Transporte de Residuos Especiales', 6711960.57, null),
  ('emergencia', 'AGF 623', '2026-07-18', 'Transporte de Residuos Especiales', 5026031.64, null),
  ('emergencia', 'AGF 624', '2026-07-18', 'Alquiler Equipo tipo Volqueta', 315718900.0, 'Alquiler de volqueta incluido en Emergencia.'),
  ('emergencia', 'AGF 646', '2026-09-02', 'Transporte de Residuos Especiales', 559370.21, null),
  ('emergencia', 'AGF 647', '2026-09-02', 'Transporte de Residuos Especiales', 149238335.54, null),
  ('emergencia', 'AGF 656', '2026-09-02', 'Transporte de Residuos Especiales', 16263151.66, 'AGF 656 y AGF 675 tienen el mismo valor; revisar.'),
  ('emergencia', 'AGF 657', '2026-09-02', 'Transporte de Residuos Especiales', 18219366.48, null),
  ('emergencia', 'AGF 658', '2026-09-02', 'Transporte de Residuos Especiales', 33834815.42, null),
  ('emergencia', 'AGF 659', '2026-09-02', 'Alquiler Equipo tipo Volqueta', 255645320.0, 'Alquiler de volqueta incluido en Emergencia.'),
  ('emergencia', 'AGF 663', '2026-09-11', 'Transporte de Residuos Especiales', 22556544.01, null),
  ('emergencia', 'AGF 664', '2026-09-11', 'Transporte de Residuos Especiales', 27503859.53, null),
  ('emergencia', 'AGF 665', '2026-09-11', 'Transporte de Residuos Especiales', 6935755.54, null),
  ('emergencia', 'AGF 666', '2026-09-11', 'Transporte de Residuos Especiales', 7539047.46, null),
  ('emergencia', 'AGF 667', '2026-09-11', 'Transporte de Residuos Especiales', 48989993.78, null),
  ('emergencia', 'AGF 668', '2026-09-11', 'Transporte de Residuos Especiales', 2796649.94, null),
  ('emergencia', 'AGF 669', '2026-09-11', 'Transporte de Residuos Especiales', 70553380.45, null),
  ('emergencia', 'AGF 670', '2026-09-11', 'Transporte de Residuos Especiales', 10523216.41, null),
  ('emergencia', 'AGF 671', '2026-09-11', 'Transporte de Residuos Especiales', 2237320.19, null),
  ('emergencia', 'AGF 672', '2026-09-11', 'Transporte de Residuos Especiales', 18327192.38, null),
  ('emergencia', 'AGF 673', '2026-09-11', 'Transporte de Residuos Especiales', 66878174.93, null),
  ('emergencia', 'AGF 674', '2026-09-11', 'Transporte de Residuos Especiales', 37787912.12, null),
  ('emergencia', 'AGF 675', '2026-09-11', 'Transporte de Residuos Especiales', 16263151.66, 'AGF 656 y AGF 675 tienen el mismo valor; revisar.'),
  ('emergencia', 'AGF 676', '2026-09-15', 'Transporte de Residuos Especiales', 16221730.14, null),
  ('alquiler', 'AGF 560', '2026-03-25', 'Alquiler: Retroexcavadora pajarita, transporte de equipo', 18424680.75, null),
  ('alquiler', 'AGF 561', '2026-03-25', 'Alquiler: Mini cargador, transporte de equipo', 7355955.25, null),
  ('alquiler', 'AGF 563', '2026-03-31', 'Alquiler: Retroexcavadora pajarita, Mini excavadora, Excavadora 22 m, transporte de equipo', 51390566.5, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 564', '2026-03-31', 'Alquiler: Mini cargador, Mini excavadora, Excavadora 22 m, transporte de equipo', 97014571.5, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 565', '2026-03-31', 'Alquiler: Cargador, Excavadora 22 m, transporte de equipo', 43224072.5, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 566', '2026-04-01', 'Alquiler: Excavadora 22 m, transporte de equipo', 29735720.0, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 568', '2026-04-08', 'Alquiler: Excavadora 22 m, transporte de equipo', 36480687.61, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 569', '2026-04-08', 'Alquiler: Excavadora 22 m', 23982367.51, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 570', '2026-04-08', 'Alquiler: Excavadora 22 m', 19267885.01, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 571', '2026-04-08', 'Alquiler: Excavadora 22 m', 30336670.01, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 572', '2026-04-10', 'Alquiler: Retroexcavadora pajarita, Mini excavadora, transporte de equipo', 54533386.25, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 575', '2026-04-14', 'Alquiler: Excavadora 22 m', 10658830.01, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 576', '2026-04-14', 'Alquiler: Excavadora 22 m', 19841822.01, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 577', '2026-04-14', 'Alquiler: Excavadora 22 m', 16521186.51, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 578', '2026-04-16', 'Alquiler: Mini excavadora, transporte de equipo', 4893756.0, null),
  ('alquiler', 'AGF 579', '2026-04-22', 'Alquiler: Excavadora 22 m, transporte de equipo', 18174989.0, null),
  ('alquiler', 'AGF 580', '2026-04-27', 'Alquiler: Mini cargador, transporte de equipo', 4088899.5, null),
  ('alquiler', 'AGF 581', '2026-04-27', 'Alquiler: Mini cargador, Cargador, transporte de equipo', 28728266.0, null),
  ('alquiler', 'AGF 583', '2026-05-12', 'Alquiler: Excavadora 22 m', 20743723.0, null),
  ('alquiler', 'AGF 584', '2026-05-12', 'Alquiler: Excavadora 22 m', 16685168.5, null),
  ('alquiler', 'AGF 585', '2026-05-12', 'Alquiler: Excavadora 22 m', 20292772.5, null),
  ('alquiler', 'AGF 586', '2026-05-12', 'Alquiler: Excavadora 22 m', 16029240.5, null),
  ('alquiler', 'AGF 587', '2026-05-12', 'Alquiler: Excavadora 22 m', 17710056.0, null),
  ('alquiler', 'AGF 588', '2026-05-20', 'Alquiler: Mini cargador, Retroexcavadora pajarita, Mini excavadora, Excavadora 22 m, Excavadora 19 t, transporte de equipo', 106433629.75, null),
  ('alquiler', 'AGF 589', '2026-05-26', 'Alquiler: Mini cargador, Cargador, transporte de equipo', 26322086.0, null),
  ('alquiler', 'AGF 590', '2026-05-26', 'Alquiler: Mini cargador, Retroexcavadora pajarita, transporte de equipo', 9004224.25, null),
  ('alquiler', 'AGF 591', '2026-06-01', 'Alquiler: Mini excavadora, Excavadora 22 m, transporte de equipo', 66436748.0, null),
  ('alquiler', 'AGF 592', '2026-06-01', 'Alquiler: Mini cargador, Mini excavadora, transporte de equipo', 45360672.88, null),
  ('alquiler', 'AGF 594', '2026-06-09', 'Alquiler: Excavadora 22 m', 21153678.0, null),
  ('alquiler', 'AGF 595', '2026-06-09', 'Alquiler: Excavadora 19 t', 20948700.5, null),
  ('alquiler', 'AGF 596', '2026-06-09', 'Alquiler: Bulldozer D6K, transporte de equipo', 48559140.0, null),
  ('alquiler', 'AGF 597', '2026-06-09', 'Alquiler: Bulldozer D6K', 9927456.0, null),
  ('alquiler', 'AGF 598', '2026-06-09', 'Alquiler: Excavadora 22 m', 13938470.0, null),
  ('alquiler', 'AGF 599', '2026-06-09', 'Alquiler: Excavadora 19 t', 20538745.5, null),
  ('alquiler', 'AGF 601', '2026-06-19', 'Alquiler: Retroexcavadora pajarita, transporte de equipo', 12825106.0, 'Factura escaneada: leída por OCR y verificada contra el valor en letras.'),
  ('alquiler', 'AGF 602', '2026-06-19', 'Alquiler: Mini cargador, Cargador, transporte de equipo', 75797496.25, null),
  ('alquiler', 'AGF 604', '2026-06-19', 'Alquiler: Cargador, transporte de equipo', 28655943.75, null),
  ('alquiler', 'AGF 605', '2026-06-24', 'Alquiler: Mini excavadora, transporte de equipo', 36776950.0, null),
  ('alquiler', 'AGF 625', '2026-07-18', 'Alquiler: Excavadora 22 m, transporte de equipo', 62286147.0, null),
  ('alquiler', 'AGF 626', '2026-07-27', 'Alquiler: Mini cargador, Retroexcavadora pajarita, Mini excavadora, transporte de equipo', 43993377.75, null),
  ('alquiler', 'AGF 627', '2026-07-27', 'Alquiler: Excavadora 19 t', 16070236.0, null),
  ('alquiler', 'AGF 628', '2026-07-28', 'Alquiler: Bulldozer D6K', 9801792.0, null),
  ('alquiler', 'AGF 629', '2026-07-28', 'Alquiler: Excavadora 19 t', 17751051.5, null),
  ('alquiler', 'AGF 630', '2026-07-28', 'Alquiler: Bulldozer D6K', 11875248.0, null),
  ('alquiler', 'AGF 631', '2026-07-28', 'Alquiler: Excavadora 22 m', 19636844.5, null),
  ('alquiler', 'AGF 632', '2026-07-28', 'Alquiler: Excavadora 22 m', 15742272.0, null),
  ('alquiler', 'AGF 633', '2026-07-28', 'Alquiler: Bulldozer D6K', 12880560.0, null),
  ('alquiler', 'AGF 634', '2026-07-28', 'Alquiler: Bulldozer D6K, transporte de equipo', 7844004.0, null),
  ('alquiler', 'AGF 635', '2026-07-28', 'Alquiler: Excavadora 22 m', 19677840.0, null),
  ('alquiler', 'AGF 636', '2026-07-31', 'Alquiler: Mini excavadora, transporte de equipo', 23505356.0, null),
  ('alquiler', 'AGF 637', '2026-08-03', 'Alquiler: Cargador, transporte de equipo', 6934725.0, null),
  ('alquiler', 'AGF 639', '2026-08-06', 'Alquiler: Mini cargador, transporte de equipo', 3895524.5, null),
  ('alquiler', 'AGF 641', '2026-08-13', 'Alquiler: Excavadora 22 m', 19308880.5, null),
  ('alquiler', 'AGF 642', '2026-08-13', 'Alquiler: Excavadora 22 m', 15004353.0, null),
  ('alquiler', 'AGF 643', '2026-08-13', 'Alquiler: Excavadora 22 m', 19144898.5, null),
  ('alquiler', 'AGF 644', '2026-08-13', 'Alquiler: Excavadora 22 m', 19349876.0, null),
  ('alquiler', 'AGF 655', '2026-09-02', 'Alquiler: Retroexcavadora pajarita, Mini excavadora, transporte de equipo', 25433810.5, null),
  ('alquiler', 'AGF 660', '2026-09-03', 'Alquiler: Mini cargador, Cargador, Retroexcavadora pajarita, transporte de equipo', 50829184.0, null),
  ('alquiler', 'AGF 677', '2026-09-15', 'Alquiler: Cargador, Excavadora 22 m, transporte de equipo', 103162885.0, null),
  ('alquiler', 'AGF 678', '2026-09-17', 'Alquiler: Retroexcavadora pajarita, Mini excavadora, transporte de equipo', 22548536.5, null)
on conflict (contrato, numero) do nothing;
