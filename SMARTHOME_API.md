# Integración API Smarthome — Constructora Anaya Giraldo S.A.S

> Referencia verificada en vivo el 2026-06-27. Dos APIs distintas en dos hosts distintos.

## Credenciales

- **companyCode:** `1059512`
- **companyId (GUID):** `e2047035-7936-4569-bc36-1695f0f97ccd`
- **UserKey BI (Liliana Ospina):** `ZTIwNDcwMzUtNzkzNi00NTY5LWJjMzYtMTY5NWYwZjk3Y2NkO2ZmNmJjMzg0LTA4NWMtNGU3OS1iMjhlLWM1OWE5ZGJhMGZiZDs2LzI3LzIwMjY=`
  - Decodificada: `e2047035-...;ff6bc384-...;6/27/2026` → la última parte es la **fecha de expiración**. ⚠️ **Regenerar en el portal cuando expire.**

## Proyectos

| Proyecto | projectCode | ProjectId encriptado (solo para leadForm / Inmobiliario) |
|---|---|---|
| Aqua Club Residencial | `3e7aa5be` | `f4lDqo57J4R/AJGW0b4SCm9JLQ1MRp1z3l2VQlcvrowfj0P/RmthzBgxi1Js8UMW` |
| Aqua Club Residencial Etapa 2 | `ffc5fa3b` | `e/iJgoBa0gwJJQ0ZHv0/ieGXsK7WQ5Lh0ypUgSr6mPcziSHmx15znw9F2fwJgZLY` |
| Cascada Real Etapa 1 | `5994bd14` | `dcNfgcTDE9anvw09YO9OdqLTClnxkhfi2j1vNUDRn4dVfUVwLEJXviIhfK4kBk7l` |
| Cascada Real Etapa 2 | `7b0b464e` | `whShVdUhx4oohfxSS24wPuSU-dmk1GwanwDBOWwWdyFoGI-Q3Fr8CfVe8fm2vi-P` |
| Cascada Real Etapa 3 | `a8177e5d` | `D/SCgaiTmfq6PA4Qc7NKIulLf9nR9AwLYT-A92I/bSt/Ok7v-1QNkUudx5YNsamO` |
| La Fontana Etapa 2 | `353c0120` | `0r-8rpmZemGBFLepP62OeWyQdOnQ1e9bhWZ7dzGR1djFMhe7ZUQGePPYb1pFYEws` |
| La Fontana home club | `449fe2ef` | `qKOFKMW1zoRwlf0vUSxNj4wMOAxsuOyuJnm/K//DfxMGQ92oB7HjRkrS0cmwJF8g` |
| Locales Comerciales | `eeffbe51` | `0nrosfNzWaROpg9mRAQBn1LkrVrQazhpgZojwbqmGM96PL9JctSkbwqz6xmVNfDD` |
| Lotes Reservas del Manantial | ⚠️ pendiente "Generar" | `Jfu27K0-XC-GcbFuH6Gk9akQ2UasRekBeWPhU/p3/Kcf53dZLTusfebhD75ZUitB` |
| Parqueaderos | `a67b21c2` | `POKFu5UFLn7pKp-FIgnGXfRhlFrYVT/bkTvl0hPKfPJMs6VK0UWMmXlD6Cf/uSPs` |
| Portal de Soledad Etapa 2 | `13cf7c2a` | `ZXDcau3MAncnKDttw-lIGrMDdz8jQ6Lo8UTfF/OkYMrQNl3g-amwjAxuUh7cvCRn` |

## API REST v1 — `https://api.smart-home.com.co/api/v1/`

Auth = `companyCode` (+ `projectCode`) en la ruta. Lecturas funcionan sin API Key; escrituras pueden requerir el API Key por proyecto.

- Compañía: `getCompany/{cc}`, `getUsers/{cc}`, `getLocationSource/{cc}`, `getSegments/{cc}`, `getActions/{cc}`, `getSaleCycle/{cc}`
- Proyectos/Inventario: `getProjects/{cc}`, `getProject/{cc}/{pc}`, `getUnits/{cc}/{pc}`, `getUnit/{cc}/{pc}/{moduleId}`, `getUnitsByCriteria/{cc}/{pc}?status=&type=&minPrice=&maxPrice=&minArea=&maxArea=&minBedrooms=&maxBedrooms=`, `getGarages`, `getStorages`, `getFeatures`, `getReservations`, `getProjectDocuments`
- Clientes/Prospectos: `addCustomer/{cc}/{pc}` (POST), `addProspect/{cc}/{pc}/{customerId}/{moduleId}/{ownerId}`, `getCustomerDetail/{cc}/{pc}/{prospectId}`, `getCustomerPayments`, `getCustomerPaymentSummary`, `changeProspectSaleCycleStage/{cc}/{pc}/{prospectId}/{stageId}`, `changeProspectUser`, `setCustomerReservation`
- Posventa: `addClaim/{cc}/{pc}` (POST), `getClaimType/{cc}`, `getClaimGroup/{cc}`, `getClaim/{cc}/{pc}/{claimId}`
- Smart Inmobiliario: `api/v1Inmobiliario/getUnits/{cc}/{pc}?page=1&records=10`, `getUnit`, `getUnitsByCriteria`, `getUnitCategory`, `getUnitType`

### Vincular Leads — `POST https://api.smart-home.com.co/api/leadForm/`

Usa el **ProjectId encriptado** (no el projectCode):

```json
{
  "first_name": "...", "last_name": "...", "email": "...", "mobile_number": "+57...",
  "origin": "www.tupagina.com", "comment": "... Habeas Data: SI.",
  "projectId": "<ProjectId ENCRIPTADO>", "locationSourceId": "<GUID>", "scoring": "20",
  "fieldList": [{"name": "Presupuesto", "value": "$150.000.000 a $200.000.000"}]
}
```

## API BI — `https://manage.smart-home.com.co/api/bi/`

Auth = `userKey` directo en la ruta (la palabra `userKey/` de la doc es placeholder, NO va literal). Respuestas en **gzip**.

- `getProjectSummary/{userKey}` — ventas + inventario
- `getProspectDetail/{userKey}?page=1&records=1000&createdDate=2023-01-01` — detalle paginado (la respuesta trae `pages` con el total)
- `getDigitalRecords/{userKey}`
- `getProspectLocationSource/{userKey}` — fuentes y medios
- `getProspectRecords/{userKey}` — registros de prospectos
- `getClaimRecords/{userKey}` — posventa

### Ejemplos curl

```bash
KEY="ZTIwNDcwMzUt...MDI2="
curl -s --compressed "https://manage.smart-home.com.co/api/bi/getProjectSummary/${KEY}"
curl -s --compressed "https://api.smart-home.com.co/api/v1/getProjects/1059512/"
curl -s --compressed "https://api.smart-home.com.co/api/v1/getUnits/1059512/3e7aa5be"
```
