# Módulo Marketing y Gestión de Leads — `/marketing`

Responde a dos requerimientos del 27 de agosto de 2026:

1. **Buzii (Julio Llanos) — KPIs para optimizar pauta**: ángulo de video ganador, perfil de quien compra,
   embudo de conversión, costo por lead calificado y por cliente, distribución por canal, estado del lead.
2. **Reunión AG + Smart Home (Liliana, Yesika)** — KPI de gestión de leads del equipo comercial: contacto
   inicial, tareas de seguimiento (semáforo verde/rojo/gris) y tasa de abandono, por asesor.

## Qué se verificó contra la API real (2026-09-03)

| Necesidad | Dónde está en Smart Home | Estado |
|---|---|---|
| Leads por anuncio / creativo | `getDigitalRecords` → `[whatsapp].source id`, `headline`, `media type`, `video url`, `thumbnail url` (click-to-WhatsApp) y `[facebook leads ad].ad id`, `form name` (Lead Ads) | ✅ Disponible. 2.493 de 3.442 leads traen el anuncio. |
| Leads calificados y ventas por creativo | Mismo registro trae `SaleCycle`, `Stage`, `Probability`, `IsSale`, `CloseDate` | ✅ Disponible (cruce automático). |
| Perfil de quien compra | `getProspectDetail` → `Genero`, `Edad`, `Ciudad`, `Barrio`, `Estado_Civil`, `Profesion`, `Fuente_de_Ubicacion_Prospecto` | ✅ Para los 48 compradores: género 48/48, ciudad 47/48, barrio 42/48, edad 37/48. `Ocupacion` viene vacío siempre. |
| Embudo completo | `Stage` + `Probability` (10 Prospecto/Contactado, 25 Seguimiento, 50 Oportunidad, 100 Negociación) + Ciclo de Compra / Cancelado / Desistido | ✅ Estado actual. ⚠️ El historial de cambios de etapa NO viene en la BI (solo en `getProspectEvents`, por prospecto). |
| Precalificación del bot / formulario | `[x].¿cuentas con crédito aprobado?`, `¿empleado o independiente?`, `¿tienes reportes negativos…?`, `capacidad de pago`, `motivación`, `tiempo de compra` | ✅ Solo para Lead Ads / Instagram (~15 % de los leads). Los de WhatsApp casi nunca lo traen. |
| Costo por lead / CPA | No existe en Smart Home | ✅ Captura manual de inversión Meta por mes (vista "Inversión y CPA"). Pendiente API de Meta Ads si se quiere automatizar. |
| Distribución por canal | `LocationSource` (WhatsApp, Facebook Leads Ad, Instagram, Página Web) | ✅ |
| Estado del lead (semáforo rojo/verde/gris) | `getProspectRecords.ActivityStatus` = `getProspectDetail.Seguimiento`: **1 = tarea activa (verde), 3 = tarea vencida (rojo), 0 = sin tareas (gris)** | ✅ Inferido con datos reales (15.520 en 3, 47 en 1). ⚠️ Pedir confirmación oficial a Smart Home. |
| Tiempo hasta el primer contacto humano | `FirstActionHours` mide la respuesta del **bot** (0 h en el 98 %). El contacto humano solo está en la bitácora (`getProspectEvents`, 1 llamada por prospecto) | ⚠️ Parcial. Hoy se muestra "sin gestión" = sigue en Prospecto y sin acciones (`Accion: Llamada Realizada`, `Respuesta por Ws`, `Envio email`, visitas). |
| Bitácora de tareas | `getProspectEvents` → `eventType 2` = tarea con `startTime`/`endTime`/`status` | ✅ Existe por prospecto. No se sincroniza aún (≈ 1 llamada por lead). |

Limitación: `getDigitalRecords` solo devuelve leads desde **junio 2026** (3.442 registros). Los prospectos sí vienen completos (24.925 de Aqua y Lotes).

## Arquitectura

- `supabase/marketing.sql` — tablas `mk_leads`, `mk_inversion`, `mk_sync_estado` y columnas nuevas en `sh_prospectos` (demografía, `seguimiento`, `acciones`). Idempotente: `npx tsx scripts/aplicar-sql.ts supabase/marketing.sql`.
- `lib/marketing/smarthome.ts` — mapeo de las respuestas de la BI (columnas dinámicas `[whatsapp].…`).
- `lib/marketing/compute.ts` — agregaciones puras: embudo, por creativo, por canal, perfil, gestión por asesor, CPA.
- `app/api/marketing/sync` — espejo Smarthome → Supabase (≈ 55 s). Lo dispara el cron diario (`vercel.json`, 11:30 UTC), el secret `CARTERA_SYNC_SECRET` o cualquier usuario con sesión desde el botón **Actualizar desde Smarthome**.
- `app/api/marketing/data` — leads y prospectos del período + compradores históricos + inversión + estado del sync.
- `app/api/marketing/inversion` — alta/baja de inversión mensual (solo gerencia ve el formulario).
- `app/marketing/MarketingClient.tsx` — tres vistas: Marketing, Gestión comercial, Inversión y CPA.

## Definiciones usadas en los KPIs

- **Lead / contacto**: un registro digital (puede repetirse si la misma persona escribe dos veces: `es_unico`).
- **Contactado**: salió de la etapa "Prospecto" (incluye descartados: alguien lo revisó) o tiene ≥ 1 acción.
- **Calificado**: probabilidad ≥ 25 % (Seguimiento en adelante) o en Ciclo de Compra.
- **Oportunidad**: probabilidad ≥ 50 %.
- **Venta**: Ciclo de Compra / `IsSale`.
- **Descartado**: Ciclo Cancelado o Desistido.
- **Sin gestión**: sigue en Prospecto, sin acciones y sin descartar. **> 24 h** = llegó hace más de un día.
- **Vencido / activo / sin tareas**: campo `Seguimiento` (3 / 1 / 0).

## Preguntas pendientes para el equipo técnico de Smart Home (ticket vía Liliana)

1. Confirmar la semántica de `ActivityStatus` / `Seguimiento`: ¿1 = tarea activa, 3 = tarea vencida, 0 = sin tareas? ¿Hay otros valores?
2. En `getProspectEvents`, ¿qué valores toma `status` de una tarea (`eventType 2`): pendiente, realizada, cancelada? ¿Se puede filtrar por fecha para no traer toda la bitácora?
3. ¿Existe un endpoint BI para tareas o eventos en bloque (todos los prospectos en un rango de fechas), sin ir prospecto por prospecto?
4. ¿`getDigitalRecords` puede devolver registros anteriores a junio 2026 (parámetro `createdDate` no surte efecto)?
5. ¿Se puede obtener el historial de cambios de etapa (fecha en que pasó a Seguimiento, Oportunidad, etc.) para construir el embudo por cohorte?
6. ¿Las respuestas del bot de WhatsApp (crédito, reportado, monto) se guardan en algún campo consultable? Hoy solo llegan por Lead Ads / Instagram.
7. ¿Cuál es la vigencia de la UserKey de la BI y cómo renovarla sin cortar el servicio? (la actual expira según su propia codificación).
