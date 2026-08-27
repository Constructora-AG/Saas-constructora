# Módulo de cartera y cobranza

Control de cartera con **estados**, **bitácora en tiempo real** y **supervisión de cobro por WhatsApp**.

## Qué hace

1. **Lee la cartera de Smarthome** (plan de pagos por venta) y calcula saldo, cuotas
   vencidas, monto en mora, días de mora y **semáforo** (Al día / 1-30 / 31-60 / 61-90 / +90).
2. **Estados de gestión manuales** por cliente: Sin gestión → Contactado → Promesa de pago →
   Acuerdo → Incumplido / Jurídico / Desistido.
3. **Bitácora en tiempo real** (Supabase Realtime): cada gestión queda registrada y aparece
   al instante en el panel de supervisión, sin recargar.
4. **Supervisión de WhatsApp:** el botón "WhatsApp" abre `wa.me` con el mensaje de cobro
   pre-armado **y registra automáticamente** el contacto (cobrador, cliente, hora, canal).
   Así ves **quién está cobrando por WhatsApp** y cuánto gestiona cada cobrador en 24h.

> Smarthome = fuente de verdad de montos/pagos (solo lectura).
> Supabase = nuestra capa de gestión (estados + bitácora + tiempo real).

## Arquitectura

```
Smarthome REST ──(/api/cartera/sync)──> Supabase: cartera (snapshot)
                                          │
   navegador ──> /cartera ───────────────┤  cartera + cartera_gestion
            └──> /supervision <───realtime── gestion_log (append-only)
   acción WhatsApp / cambio estado ──(/api/gestion)──> gestion_log ──trigger──> cartera_gestion
```

Tablas (ver `supabase/schema.sql`):
- `cartera` — snapshot por venta (saldo, mora, semáforo). Lo refresca el sync.
- `cartera_gestion` — estado actual de gestión por cliente.
- `gestion_log` — bitácora append-only (Realtime ON). El feed de supervisión.
- `cobradores` — equipo de cobranza.
- `v_actividad_cobrador` — vista con contadores 24h por cobrador (WhatsApp, gestiones, clientes).

## Puesta en marcha

```bash
# 1. Crear proyecto en https://supabase.com y correr supabase/schema.sql en el SQL Editor.
# 2. Variables en .env.local:
#    NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#    SMARTHOME_BI_USERKEY (ya), CARTERA_SYNC_SECRET
npm install
npm run dev

# 3. Primera sincronización (trae la cartera de Smarthome a Supabase):
curl -X POST "http://localhost:3000/api/cartera/sync?secret=TU_CARTERA_SYNC_SECRET"
#   o de un solo proyecto:
curl -X POST "http://localhost:3000/api/cartera/sync?secret=...&projectCode=3e7aa5be"
```

Luego abre:
- **`/cartera`** — tabla de cartera, filtros por semáforo / sin gestión, botón WhatsApp, cambio de estado.
- **`/supervision`** — tarjetas por cobrador + bitácora en vivo.

## Sincronización automática

`vercel.json` programa el sync 3 veces al día (6am, 1pm, 8pm). Al desplegar en Vercel
define `CARTERA_SYNC_SECRET` (y opcionalmente `CRON_SECRET`). El cron de Vercel se autoriza
solo (header `x-vercel-cron`).

## Estados de gestión

| Estado | Significado |
|---|---|
| `sin_gestion` | Aún no se ha contactado |
| `contactado` | Se hizo contacto (auto al usar WhatsApp) |
| `promesa_pago` | Cliente prometió pagar |
| `acuerdo_pago` | Acuerdo formal de pago |
| `incumplido` | Incumplió promesa/acuerdo |
| `juridico` | Pasó a cobro jurídico |
| `desistido` | Desistió de la compra |
| `al_dia` | Cartera al día |

El semáforo de mora es **automático** (calculado del plan de pagos); el estado de gestión es **manual**.

## Limitación honesta de WhatsApp

El clic en `wa.me` registra que el cobrador **abrió** el chat (evidencia de gestión), no que
el mensaje fue enviado/leído. Para entrega/lectura verificable se requiere la **WhatsApp Cloud
API** oficial (Meta Business + plantillas aprobadas). La capa de bitácora ya está lista para
activarla después sin reescribir: solo se agregaría un endpoint de envío que inserte en
`gestion_log` con el `messageId` y estado de entrega.

## Pendientes

- [ ] Autenticación real (hoy el cobrador se elige en un selector; añadir login y RLS en Supabase).
- [ ] Subida de captura de evidencia a Supabase Storage (`evidencia_url` ya está en el esquema).
- [ ] Ajustar el mapeo de `moduleStatus`/estados de venta con el catálogo oficial de Smarthome.
