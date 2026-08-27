# Documentación técnica — Control Transporte AAA

Referencia interna para desarrolladores o administradores que deban mantener, auditar o
portar la aplicación a otra arquitectura. Complementa el `README.md` (despliegue).

---

## 1. Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Interfaz | HTML5 + CSS3 + JavaScript ES2020, sin framework | Un solo archivo, sin build/bundler |
| Gráficas | Chart.js 4.4.0 (CDN cdnjs) | Barras, dona, líneas |
| Exportación Excel/CSV | SheetJS xlsx 0.18.5 (CDN) | `XLSX.utils.json_to_sheet` |
| PDF | pdf-lib 1.17.1 (CDN) | Reporte con soportes y orden de servicio |
| Tipografías | Google Fonts: Space Grotesk / Inter / IBM Plex Mono | |
| Persistencia | Firebase Realtime Database (REST puro, sin SDK) | Intercambiable (§4) |

## 2. Estructura del archivo fuente

`Control transporte aaa.html` (~238 KB, ~3.300 líneas):

1. `<head>`: metadatos, CDNs, **CSS completo** (tema de marca AG: oliva `#4A5A00` / lima `#C8D400`;
   variables en `:root`; media queries en 980/860/767/600 px).
2. `<body>`: `app-shell` → `sidebar` (escritorio) + `main-content` con las vistas:
   `viewResumen` (línea de tiempo, KPIs, gráfica, alertas, exportación global),
   `viewServices` (pestañas de mes + tabla), `viewTarifario`, `viewReportes` (analítico),
   `viewFlota`, `viewPersonal`. Después: modales (`overlay` servicio, `adminGate`,
   `adminOverlay`, `reportOverlay`), `bottom-nav` + `fab` (móvil), `toast`.
3. `<script>` único: configuración → adaptador Firebase → constantes de contrato →
   festivos/seeds → capa de storage → renderizadores → módulos → `init()`.

## 3. Modelo de datos (claves en el backend)

Todos los valores se guardan como **string JSON** bajo el nodo `/agpanel`.

### 3.1 `adminconfig`
```jsonc
{
  "profiles": {
    "gerencia": { "label": "Gerencia", "password": "2952" },
    "renzo":    { "label": "Renzo",   "password": "0610",
                  "perms": { "interventores": false, "areas": false, "vehiculos": true,
                             "equipos": false, "festivos": false, "personal": false } },
    "jesus":    { "label": "Jesús",   "password": "4503", "perms": { /* ídem */ } }
  },
  "interventores": ["Camilo Lozano", "..."],          // 26 sembrados del Excel del contrato
  "areas": ["Gerencia de Aseo", "..."],               // 6 áreas AAA
  "vehiculos": [{
      "plate": "LZR529", "marca": "Foton (grúa planchón)", "tipo": null, "modelo": 2023,
      "capacity": 5.9, "driver": "Hernando Peña Urueta", "activo": true,
      "venceSoat": "2027-04-16", "venceTecno": "2027-04-15"
  }],
  "equipos": [{ "name": "Excavadora", "clase": "Excavadora", "marca": "Caterpillar",
                "cantidad": 1, "weight": 31, "alto": 3.08, "ancho": 2.99, "largo": 9.8 }],
  "personal": [{ "nombre": "Hernando Peña Urueta", "cedula": "1143114867",
                 "activo": true, "venceLicencia": null }],
  "festivosCustom": [{ "date": "2026-09-15", "label": "Día cívico" }],
  "contractStart": "2026-07-01",
  "contractEnd":   "2027-08-31",
  "backupLastAt":  "2026-08-13T14:00:00.000Z",
  "seedVersion": 4
}
```

### 3.2 `tarifario`
`{ recargos: { nocturno: 109600, dominicalFestivo: 126905 }, categorias: [ {nombre, rutas:[{nombre, valor}]} ] }`
Editable desde la vista Tarifario; sincronizado para todo el equipo.

### 3.3 `services:AAAA-MM` (una clave por mes)
Arreglo de servicios. Campos por servicio:
```jsonc
{
  "id": "svc_...", "date": "2026-08-05", "orderNo": "", "serviceType": "Programado|No Programado|Emergencia",
  "interventor": "", "areaAAA": "Gerencia de Aseo",      // (alias legado leído: areaSolicitante)
  "hourReq": "08:00", "hourAtt": "09:00",
  "plate": "LZR529", "capacity": "5.9", "driver": "…", "equipment": "…", "weight": "…",
  "pickup": "", "destination": "", "area": "Soledad",
  "value": 709199, "tolls": 0,
  "tarifaCategoria": null, "tarifaRuta": null,
  "recargoNocturno": false, "recargoDominical": false,
  "notes": "", "photo": true, "photoFiles": [ { "name", "type", "dataUrl(base64)" } ],
  "approved": true, "approvalFile": { … } | null,        // V°B° del interventor (Triple A)
  "invoiced": false,
  "approvedBy": "Gerencia", "approvedByKey": "gerencia", // aprobación interna AG con clave
  "approvedAt": "2026-08-05T14:22:00.000Z"               // (alias legado leído: aprobadoPor)
}
```

### 3.4 Copia de seguridad (archivo descargable)
`{ "app": "control_contrato_aaa", "version": 1, "generatedAt": ISO, "keys": { "<clave>": "<string JSON>" } }`
La restauración valida `app` y sobrescribe todas las claves.

## 4. Capa de almacenamiento (portabilidad)

Contrato `window.storage` (todas async):
`get(key) → {key,value:string}|null` · `set(key,value:string) → {key,value}` ·
`delete(key)` · `list() → {keys:[]}`.

- Adaptador actual: `initFirebaseStorage()` — REST contra
  `GET/PUT/DELETE https://<db>.firebaseio.com/agpanel/<claveURI>.json` y
  `GET /agpanel.json?shallow=true` para listar.
- Para otra arquitectura: implementar el contrato (plantilla en
  `adaptadores/adaptador-rest-generico.js`, incluye SQL clave-valor de referencia).
- `waitForStorage()` y el banner `storageBanner` avisan si no hay backend disponible.

**Sincronización:** `pollRefresh()` cada 12 s (se pausa con modales abiertos, `isModalOpen`).
Cada tick recarga el mes activo + `adminconfig`; cada 5.º tick (~60 s) recarga todos los meses.
Cambios de vigencia detectados por firma `contractStart|contractEnd` → reconstrucción de meses.

**Límites de peso** (en `saveMonth`): Firebase → aviso >8 MB, bloqueo >20 MB; modo Claude → bloqueo >4.5 MB.
Fotos comprimidas en cliente (`compressImage`, ~900 px, calidad 0.62, JPEG).

## 5. Seguridad funcional

- **Perfiles:** gerencia / renzo / jesus, con clave propia. Gerencia: acceso total, gestiona
  permisos por sección (interventores, áreas, vehículos, equipos, festivos, personal),
  claves de los tres perfiles, fechas del contrato y copias de seguridad.
- **Aprobación de registros:** guardar un servicio (nuevo o editado) exige perfil + clave
  válida; queda `approvedBy/approvedAt` en el registro, la tabla, exportaciones y la orden PDF.
- **Edición de Flota/Personal:** requiere sesión de administración con el permiso respectivo.
- **Advertencia:** las claves viven en el JSON de `adminconfig` y el nodo es abierto por URL.
  Mitigaciones actuales: URL no pública + uso interno. Endurecimiento recomendado si se
  expone: Firebase Auth (email/clave) + reglas `auth != null`, o backend propio con sesión.

## 6. Migraciones de datos (`seedVersion`)

`applySeed()` corre al cargar `adminconfig` y aplica deltas una sola vez (idempotente; lo que
el equipo borre después NO se repone):

| Versión | Contenido |
|---|---|
| 1 | Listas del Excel del contrato: 6 áreas, 26 funcionarios, 6 vehículos con conductor designado |
| 2 | 6 máquinas AAA con ficha completa (clase, marca, cantidad, dimensiones) |
| 3 | Claves definitivas de perfiles (2952 / 0610 / 4503) |
| 4 | SOAT/tecnomecánica/modelo por placa + catálogo de personal (6 conductores con cédula) |

Para nuevas cargas masivas: agregar bloque `if (from < 5){...}` e incrementar `SEED_VERSION`.

## 7. Módulos funcionales

- **Resumen:** línea de tiempo (tiempo vs. valor ejecutado), 6 KPIs, gráfica mensual,
  **alertas contractuales**: emergencia >3 h (numeral 14), soportes incompletos (numeral 25),
  sobrepeso vs. capacidad, 90 % del valor del contrato, y **vencimientos** de SOAT/tecno/licencias
  (rojo vencido, ámbar ≤30 días).
- **Registros:** una pestaña por mes de la vigencia. Registro con: desplegables maestros
  (interventor, área AAA, placa→capacidad+conductor, equipo→peso), recargos automáticos
  (sáb/dom/festivo — 21 festivos Ley Emiliani precargados + personalizados — y nocturno
  19:00–06:00, con desmarcado manual que prevalece), evidencias comprimidas, V°B°,
  duplicado ⧉, orden de servicio PDF, facturación por servicio.
- **Reportes:** (a) modal rápido por escenario: día / vehículo / área AAA; (b) vista analítica
  con 12 filtros, totales, tabla, valor por mes, distribución por tipo, top vehículos/conductores,
  cumplimiento, tiempo de respuesta de emergencias vs. límite de 3 h, ranking de riesgo y
  mapa de calor día×franja. Exportación CSV/XLSX/PDF (sin marcar facturado).
- **Tarifario:** categorías × rutas + recargos, editable, con recálculo del valor en el formulario.
- **Flota / Personal:** catálogos únicos (viven en `adminconfig`), semáforos de vencimiento,
  altas/ediciones/bajas con permisos; alimentan los desplegables del formulario.
- **Administración:** listas maestras, permisos, claves, fechas del contrato, festivos,
  copia de seguridad/restauración.

## 8. Interfaz responsiva

| Ancho | Presentación |
|---|---|
| >860 px | Barra lateral fija (logo AG, 7 ítems) + contenido |
| 768–860 px | Barra convertida en fila de chips superior |
| ≤767 px | **Modo celular:** navegación inferior fija (7 pestañas), botón flotante ＋ para registrar, tablas transformadas en tarjetas apiladas (clase `cards-md` + atributos `data-l`), modales a pantalla completa, cabecera compacta, safe-area iOS |

## 9. Puntos de extensión sugeridos

1. Firebase Auth + reglas por usuario (endurecimiento).
2. Campo `fechaFacturado` por servicio → habilita flujo de caja proyectado e informes enviados.
3. Compresión adicional o almacenamiento de evidencias en Firebase Storage (URLs en lugar de base64).
4. Notificaciones (correo/WhatsApp vía backend) para vencimientos y emergencias fuera de plazo.
