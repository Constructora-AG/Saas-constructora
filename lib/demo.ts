// Datos de demostración para ver la app sin configurar Supabase.
// Se activan automáticamente cuando faltan las variables de entorno de Supabase.

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("TU-PROYECTO"),
  );
}

export const DEMO_COBRADORES = [
  { id: "c1", nombre: "Liliana Ospina" },
  { id: "c2", nombre: "Andrés Caro" },
  { id: "c3", nombre: "Marcela Ruiz" },
];

export const DEMO_CARTERA = [
  {
    prospect_id: "613e2307-ddfd-4fda-b259-0d0437feb30e",
    project_name: "Aqua Club Residencial",
    module: "TORRE 5 APTO 419",
    cliente: "Janer Rafael Llanos González",
    celular: "573028488120",
    saldo: 121815000,
    monto_en_mora: 600000,
    cuotas_vencidas: 2,
    dias_mora: 47,
    semaforo: "d31_60",
    proxima_cuota_fecha: "2026-07-28",
    estado: "promesa_pago",
    ultima_gestion_at: "2026-06-25T14:30:00",
    ultimo_canal: "whatsapp",
  },
  {
    prospect_id: "c21d80f4-24ed-4fab-8762-a99651d6132e",
    project_name: "Cascada Real Etapa 1",
    module: "BLOQUE 5 Apto 402",
    cliente: "María Fernanda Gómez",
    celular: "573104455667",
    saldo: 84150000,
    monto_en_mora: 1200000,
    cuotas_vencidas: 4,
    dias_mora: 98,
    semaforo: "d90_mas",
    proxima_cuota_fecha: "2026-07-30",
    estado: "incumplido",
    ultima_gestion_at: "2026-06-20T09:15:00",
    ultimo_canal: "llamada",
  },
  {
    prospect_id: "demo-3",
    project_name: "La Fontana Etapa 2",
    module: "TORRE 12 APTO 101",
    cliente: "Eduardo Lemus Ariza",
    celular: "573028488120",
    saldo: 56000000,
    monto_en_mora: 0,
    cuotas_vencidas: 0,
    dias_mora: 0,
    semaforo: "al_dia",
    proxima_cuota_fecha: "2026-07-15",
    estado: "al_dia",
    ultima_gestion_at: null,
    ultimo_canal: null,
  },
  {
    prospect_id: "demo-4",
    project_name: "Aqua Club Residencial Etapa 2",
    module: "TORRE 2 APTO 305",
    cliente: "Carlos Andrés Petro",
    celular: "573159988776",
    saldo: 98300000,
    monto_en_mora: 300000,
    cuotas_vencidas: 1,
    dias_mora: 18,
    semaforo: "d1_30",
    proxima_cuota_fecha: "2026-07-20",
    estado: "sin_gestion",
    ultima_gestion_at: null,
    ultimo_canal: null,
  },
  {
    prospect_id: "demo-5",
    project_name: "Cascada Real Etapa 3",
    module: "BLOQUE 1 Apto 201",
    cliente: "Diana Patricia Mejía",
    celular: "573201122334",
    saldo: 72000000,
    monto_en_mora: 900000,
    cuotas_vencidas: 3,
    dias_mora: 72,
    semaforo: "d61_90",
    proxima_cuota_fecha: "2026-07-25",
    estado: "juridico",
    ultima_gestion_at: "2026-06-18T16:45:00",
    ultimo_canal: "email",
  },
];

export const DEMO_ACTIVIDAD = [
  { cobrador_id: "c1", cobrador: "Liliana Ospina", whatsapp_24h: 12, gestiones_24h: 18, clientes_24h: 15, ultima_gestion: "2026-06-27T08:40:00" },
  { cobrador_id: "c2", cobrador: "Andrés Caro", whatsapp_24h: 7, gestiones_24h: 9, clientes_24h: 8, ultima_gestion: "2026-06-27T07:55:00" },
  { cobrador_id: "c3", cobrador: "Marcela Ruiz", whatsapp_24h: 3, gestiones_24h: 4, clientes_24h: 4, ultima_gestion: "2026-06-26T18:20:00" },
];

export const DEMO_FEED = [
  { id: "l1", prospect_id: "613e2307-ddfd-4fda-b259-0d0437feb30e", cobrador_nombre: "Liliana Ospina", canal: "whatsapp", tipo: "contacto", resultado: "promesa", nota: "Pagará el viernes", created_at: "2026-06-27T08:40:00", cliente: "Janer Rafael Llanos González", module: "TORRE 5 APTO 419" },
  { id: "l2", prospect_id: "demo-4", cobrador_nombre: "Andrés Caro", canal: "whatsapp", tipo: "contacto", resultado: "no_contesta", nota: null, created_at: "2026-06-27T08:12:00", cliente: "Carlos Andrés Petro", module: "TORRE 2 APTO 305" },
  { id: "l3", prospect_id: "c21d80f4-24ed-4fab-8762-a99651d6132e", cobrador_nombre: "Liliana Ospina", canal: "llamada", tipo: "cambio_estado", resultado: null, nota: "Pasa a jurídico", created_at: "2026-06-27T07:55:00", cliente: "María Fernanda Gómez", module: "BLOQUE 5 Apto 402" },
  { id: "l4", prospect_id: "demo-5", cobrador_nombre: "Marcela Ruiz", canal: "email", tipo: "contacto", resultado: "sin_respuesta", nota: null, created_at: "2026-06-26T18:20:00", cliente: "Diana Patricia Mejía", module: "BLOQUE 1 Apto 201" },
];

// Prefacturas AAA de demostración — calcadas de las prefacturas reales del corte
// jul-2026 (28-1, 29-1, 42-1, 43-1 en Alquiler; una nueva en Emergencia).
export const DEMO_PREFACTURAS = [
  { id: "p1", numero: "29-1", contrato: "alquiler", fecha_generacion: "2026-07-28", fecha_vencimiento: "2026-07-31", centro_costo: "MANTENIMIENTO", periodo: "21 al 25 de julio", lugar: "POCITOS", items: [{ item: "Alq excavadora sobre oruga 22 m", maquina: "Excavadora 22M", unidad: "HR", cantidad: 36.6, vr_unit: 344500, valor_base: 12608700 }], valor_base: 12608700, estado: "en_conciliacion", numero_factura: null, fecha_factura: null, nota: "Se anexan órdenes de servicio generadas", created_at: "2026-07-28T10:00:00", updated_at: "2026-07-28T10:00:00" },
  { id: "p2", numero: "28-1", contrato: "alquiler", fecha_generacion: "2026-07-28", fecha_vencimiento: "2026-07-31", centro_costo: "MANTENIMIENTO", periodo: "14 al 19 de julio", lugar: "POCITOS", items: [{ item: "Alq excavadora sobre oruga 22 m", maquina: "Excavadora 22M", unidad: "HR", cantidad: 47.1, vr_unit: 344500, valor_base: 16225950 }], valor_base: 16225950, estado: "en_conciliacion", numero_factura: null, fecha_factura: null, nota: null, created_at: "2026-07-28T10:05:00", updated_at: "2026-07-28T10:05:00" },
  { id: "p3", numero: "42-1", contrato: "alquiler", fecha_generacion: "2026-07-01", fecha_vencimiento: "2026-07-31", centro_costo: "ASEO", periodo: "7 de julio 2026", lugar: "Clínica General del Norte", items: [{ item: "Alq cargador pala frontal", maquina: "Cargador 12Ton", unidad: "HRA", cantidad: 8, vr_unit: 206250, valor_base: 1650000 }, { item: "Transporte cargador vj", maquina: "Cargador 12Ton", unidad: "VJ", cantidad: 2, vr_unit: 1470000, valor_base: 2940000 }], valor_base: 4590000, estado: "en_conciliacion", numero_factura: null, fecha_factura: null, nota: "Se anexan órdenes de servicio generadas", created_at: "2026-07-28T10:10:00", updated_at: "2026-07-28T10:10:00" },
  { id: "p4", numero: "43-1", contrato: "alquiler", fecha_generacion: "2026-07-28", fecha_vencimiento: "2026-07-31", centro_costo: "ASEO", periodo: "julio", lugar: "B/quilla", items: [{ item: "Alq retroexcavadora bq", maquina: "Pajarita", unidad: "HH", cantidad: 23.46, vr_unit: 181250, valor_base: 4252125 }], valor_base: 4252125, estado: "en_conciliacion", numero_factura: null, fecha_factura: null, nota: null, created_at: "2026-07-28T10:15:00", updated_at: "2026-07-28T10:15:00" },
  { id: "p5", numero: "E-12", contrato: "emergencia", fecha_generacion: "2026-07-28", fecha_vencimiento: null, centro_costo: null, periodo: "corte al 28 de julio", lugar: "Relleno sanitario", items: [{ item: "Transporte volq dd emergencia", maquina: "Transporte emergencia", unidad: "DD", cantidad: 34.9, vr_unit: 15905836, valor_base: 555113676 }], valor_base: 555113676, estado: "en_conciliacion", numero_factura: null, fecha_factura: null, nota: "Ajuste de consumido de este corte", created_at: "2026-07-28T10:20:00", updated_at: "2026-07-28T10:20:00" },
];
