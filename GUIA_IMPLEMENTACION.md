# Guía completa — Integración Smarthome CRM (Constructora Anaya Giraldo S.A.S)

Documentación + implementación en **Next.js (App Router)**, lista para correr.
Verificada en vivo el **2026-06-27** contra los servidores reales de Smarthome.

---

## 1. Resumen ejecutivo

Smarthome expone **dos APIs separadas, en dos hosts distintos**:

| | **API REST v1** | **API BI** |
|---|---|---|
| Host | `https://api.smart-home.com.co` | `https://manage.smart-home.com.co` |
| Propósito | Operación: inventario, proyectos, clientes, **leads**, posventa | Reportería: prospectos, ventas, fuentes, posventa |
| Auth | `companyCode` (+ `projectCode`) en la URL; **API Key** para escrituras | `userKey` en la URL |
| Formato | JSON | JSON **gzip** |

> ⚠️ **Trampa documental:** la doc oficial muestra rutas como `.../getProjectSummary/userKey/`.
> La palabra `userKey/` es un **placeholder**, NO va literal. El valor va directo:
> `.../getProjectSummary/<TU_USERKEY>`. Ponerla literal da **404**.

> ⚠️ **La UserKey de BI EXPIRA.** Decodificada en base64 termina en una fecha
> (`...;6/27/2026`) que es su vencimiento. Cuando caduque, **regenérala en el portal**
> (Integraciones API > BI) y actualiza `SMARTHOME_BI_USERKEY`.

---

## 2. Credenciales y datos de la cuenta

- **companyCode:** `1059512`
- **companyId (GUID):** `e2047035-7936-4569-bc36-1695f0f97ccd`
- **UserKey BI:** la cadena base64 (usuario Liliana Ospina) — va en `.env.local`.
- **API Key REST:** se genera por proyecto en el portal (aún pendiente). Necesaria solo
  para **escrituras** (`addCustomer`, `addClaim`). Las **lecturas** funcionaron sin ella.

### Tres identificadores de proyecto — no confundirlos

| Identificador | Ejemplo (Aqua Club) | Se usa en |
|---|---|---|
| **projectCode** (hex corto) | `3e7aa5be` | Todos los `/api/v1/...` (inventario, unidades, clientes) |
| **ProjectId encriptado** (string largo) | `f4lDqo57J4R/AJGW0b4S...` | **Solo** `/api/leadForm` y Smart Inmobiliario |
| projectId (GUID) | `a67b21c2-a2c8-...` | Devuelto por `getProjects`, uso interno |

El mapa completo está en `lib/smarthome/projects.ts`.
⚠️ **Lotes Reservas del Manantial** no tiene `projectCode` (pendiente "Generar" en el portal).

---

## 3. Catálogo de endpoints (verificado)

### 3.1 API REST v1 — `https://api.smart-home.com.co/api/v1/`

**Compañía**
- `GET getCompany/{cc}` — datos de la empresa ✅
- `GET getUsers/{cc}` — asesores/usuarios
- `GET getLocationSource/{cc}` — fuentes de ubicación (para `locationSourceId` de leads)
- `GET getSegments/{cc}` · `getActions/{cc}` · `getSaleCycle/{cc}`

**Proyectos / inventario**
- `GET getProjects/{cc}` — lista de proyectos ✅
- `GET getProject/{cc}/{pc}`
- `GET getUnits/{cc}/{pc}` — unidades de un proyecto ✅
- `GET getUnit/{cc}/{pc}/{moduleId}`
- `GET getUnitsByCriteria/{cc}/{pc}?status=&type=&building=&floor=&minPrice=&maxPrice=&minArea=&maxArea=&minBedrooms=&maxBedrooms=&minBathrooms=&maxBathrooms=`
- `GET getGarages` · `getStorages` · `getFeatures` · `getReservations` · `getProjectDocuments`

**Clientes / prospectos**
- `POST addCustomer/{cc}/{pc}` — body: `firstName, lastName, email, mobileNumber, moduleId, locationSourceId, ownerId, identificationNumber, city...`
- `GET addProspect/{cc}/{pc}/{customerId}/{moduleId}/{ownerId}`
- `GET getCustomerDetail/{cc}/{pc}/{prospectId}`
- `GET getCustomerPayments` · `getCustomerPaymentSummary` · `getCustomerScheduledPayments`
- `GET changeProspectSaleCycleStage/{cc}/{pc}/{prospectId}/{stageId}`
- `GET ChangeProspectUser/{cc}/{pc}/{prospectId}/{userId}`
- `GET setCustomerReservation/{cc}/{pc}/{prospectId}/{endDate}`
- `POST updateProspect/{cc}` · `POST addProspectDocument/{cc}`

**Posventa (Claims)**
- `POST addClaim/{cc}/{pc}` · `POST addClaimEvent/{cc}/{pc}` · `POST addClaimFile/{cc}/{claimId}`
- `GET getClaim/{cc}/{pc}/{claimId}`
- `GET getClaimType/{cc}` · `getClaimGroup/{cc}` · `getClaimCategory/{cc}` · `getClaimStage/{cc}`

**Eventos / agenda**
- `GET getEvents/{cc}/{pc}/{userId}/{actionId}/{startDate}/{endDate}`
- `POST postEvent/{cc}/{pc}/{prospectId}` · `POST postCalendarEvent/...`

**Smart Inmobiliario** — `/api/v1Inmobiliario/...`
- `GET getUnits/{cc}/{pc}?page=1&records=10` · `getUnit` · `getUnitsByCriteria` · `getUnitCategory` · `getUnitType`

### 3.2 Vincular Leads — `POST https://api.smart-home.com.co/api/leadForm/`

Usa el **ProjectId ENCRIPTADO**:

```json
{
  "first_name": "John", "last_name": "Doe",
  "email": "john.doe@email.com", "mobile_number": "+5733292331",
  "origin": "www.tupagina.com",
  "comment": "Deseo conocer más información. Habeas Data: SI.",
  "projectId": "f4lDqo57J4R/AJGW0b4S...",
  "locationSourceId": "<GUID de getLocationSource>",
  "scoring": "20",
  "fieldList": [
    { "name": "Presupuesto", "value": "$150.000.000 a $200.000.000" },
    { "name": "Horizonte de Compra", "value": "2-4 Meses" }
  ]
}
```

### 3.3 API BI — `https://manage.smart-home.com.co/api/bi/`

Auth = `userKey` directo en la ruta. Respuestas **gzip** (Node/`fetch` las descomprime solo).

- `GET getProjectSummary/{userKey}` — ventas + inventario ✅
- `GET getProspectDetail/{userKey}?page=1&records=1000&createdDate=2023-01-01` — **paginado**; la respuesta trae `pages` (total) ✅
- `GET getDigitalRecords/{userKey}` — registros digitales
- `GET getProspectLocationSource/{userKey}` — fuentes y medios
- `GET getProspectRecords/{userKey}` — registros de prospectos
- `GET getClaimRecords/{userKey}` — posventa

> El "Detalle de Prospectos" paginado real es **`getProspectDetail`** (la doc lo lista dos veces apuntando distinto).

---

## 4. Arquitectura de la implementación

```
.
├─ lib/smarthome/
│  ├─ projects.ts   # mapa code <-> encryptedId de los 11 proyectos
│  ├─ types.ts      # tipos de respuesta (Company, Project, Unit, BI...)
│  └─ client.ts     # cliente server-only: rest.*, bi.*, addLead()  ← núcleo
├─ app/
│  ├─ page.tsx                      # dashboard (KPIs por proyecto)
│  ├─ layout.tsx
│  └─ api/
│     ├─ bi/[endpoint]/route.ts     # proxy BI con whitelist
│     ├─ inventory/route.ts         # proyectos / unidades
│     └─ leads/route.ts             # POST lead (resuelve encryptedId)
├─ scripts/smoke.ts                 # prueba de conectividad sin Next
├─ .env.local.example
└─ SMARTHOME_API.md                 # referencia rápida
```

**Principio de seguridad:** las claves (`userKey`, `apiKey`) viven **solo en el servidor**
(`.env.local`, sin `NEXT_PUBLIC_`). El navegador nunca las ve: habla con `/api/*`, y esas
rutas (Server) llaman a Smarthome. `client.ts` importa `"server-only"` para garantizarlo.

---

## 5. Puesta en marcha

```bash
# 1. Variables de entorno
cp .env.local.example .env.local
#   edita .env.local y pega tu SMARTHOME_BI_USERKEY (y SMARTHOME_API_KEY si la generas)

# 2. Dependencias
npm install

# 3. Prueba de conectividad (sin levantar Next)
export SMARTHOME_BI_USERKEY="ZTIwNDcw...MDI2="
npm run smoke

# 4. Desarrollo
npm run dev       # http://localhost:3000  -> dashboard
```

### Endpoints locales que quedan disponibles

```bash
# Lecturas BI (la userKey queda oculta en el servidor)
curl "http://localhost:3000/api/bi/getProjectSummary"
curl "http://localhost:3000/api/bi/getProspectDetail?page=1&records=1000&createdDate=2024-01-01"

# Inventario
curl "http://localhost:3000/api/inventory"                       # proyectos
curl "http://localhost:3000/api/inventory?projectCode=3e7aa5be"  # unidades Aqua Club

# Crear lead (acepta projectCode o projectName y resuelve el encryptedId)
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Ana","last_name":"Pérez","email":"ana@mail.com",
       "mobile_number":"+573001112233","origin":"www.agconstructora.co",
       "projectCode":"3e7aa5be","comment":"Interés en apto. Habeas Data: SI."}'
```

---

## 6. Despliegue en Vercel

1. Sube el repo a GitHub e impórtalo en Vercel (framework detectado: Next.js).
2. En **Settings > Environment Variables** agrega: `SMARTHOME_COMPANY_CODE`,
   `SMARTHOME_BI_USERKEY`, `SMARTHOME_API_KEY`, `SMARTHOME_API_BASE`, `SMARTHOME_BI_BASE`.
3. Deploy. El dashboard usa `force-dynamic`; los `fetch` de lectura cachean 60s.
4. **Recordatorio de expiración:** programa renovar la `SMARTHOME_BI_USERKEY` antes de su
   fecha de vencimiento (un Cron Job de Vercel puede avisar, o un recordatorio en calendario).

---

## 7. Casos de uso típicos

| Necesidad | Cómo |
|---|---|
| Capturar leads desde tu web/landing | `POST /api/leads` con `projectCode` |
| Conectar Meta/Facebook Lead Ads | Reenviar el lead a `POST /api/leads` (webhook intermedio) |
| Mostrar inventario disponible en tu sitio | `GET /api/inventory?projectCode=...` y filtrar `status` |
| Dashboard de ventas para gerencia | `bi.projectSummary()` agregado por proyecto (ver `app/page.tsx`) |
| Reporte de prospectos / fuentes | `bi.prospectDetail({ all: true })`, `bi.raw('getProspectLocationSource')` |
| Exportar a Excel/BI externo | Recorrer `getProspectDetail` paginado y volcar a CSV/Sheets |

---

## 8. Notas y pendientes

- [ ] Generar **API Key** por proyecto en el portal (para `addCustomer`/`addClaim`).
- [ ] Generar **projectCode** de *Lotes Reservas del Manantial*.
- [ ] Confirmar el mapeo exacto de `moduleStatus`/`saleStatus` con Smarthome (el dashboard
      asume `1 = disponible`; ajusta `aggregate()` en `app/page.tsx` cuando tengas el catálogo).
- [ ] Definir los `locationSourceId` que usarás al crear leads (`GET /api/v1/getLocationSource`).
- [ ] Programar renovación de la UserKey de BI antes de su expiración.
```
