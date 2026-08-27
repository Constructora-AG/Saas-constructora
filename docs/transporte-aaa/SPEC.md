# SPEC — Panel de Control de Transporte AAA (Contrato IS No. 04-2026)

Especificación funcional exhaustiva del archivo `public/transporte-aaa.html` (3.297 líneas, SPA
HTML+CSS+JS sin framework), destinada a reimplementar el panel como módulo nativo
Next.js/React/TypeScript **sin necesidad de leer el HTML original**. Todos los valores, textos de
UI, fórmulas y nombres de campos son literales copiados del código fuente. El §12 contiene el
índice de líneas del archivo original para consultas puntuales.

---

## 1. Configuración y constantes

### 1.1 Backend / Firebase

```js
const FIREBASE_DATABASE_URL = 'https://control-transporte-aaa-default-rtdb.firebaseio.com';
```
Si se deja `''`, la app usa el "almacenamiento de Claude" (un `window.storage` inyectado
externamente); con URL, `initFirebaseStorage()` instala su propio `window.storage` (ver §2).

### 1.2 Contrato

```js
const CONTRACT_VALUE = 2891433496;          // COP, IVA excluido
const CONTRACT_MONTHS = 14;                 // plazo en meses (respaldo si no hay fecha fin)
let START_DATE = new Date(2026,6,1);        // 1 jul 2026 (editable desde Administración)
let END_DATE  = new Date(2027,8,1);         // EXCLUSIVO (cubre hasta 31 ago 2027)
const TODAY = new Date();
```

- Identidad del contrato (textos literales de la cabecera):
  - Eyebrow: `Contrato de Prestación de Servicios · IS No. 04-2026`
  - Título H1: `Transporte de Equipos y Maquinaria — Triple A / Anaya Giraldo`
  - Contratante: `Triple A de B/Q S.A. E.S.P.`
  - Contratista: `Constructora Anaya Giraldo S.A.S.` — NIT `900.530.150-5` (solo aparece en el PDF)
  - Vigencia por defecto mostrada: `01 jul 2026 → 31 ago 2027`
- `applyContractDates(startStr, endStr)`: parsea `AAAA-MM-DD`; la fecha fin del formulario es
  **inclusiva** (`END_DATE = lastDay + 1 día`). Si no hay fin válido, respaldo:
  `END_DATE = START_DATE + 14 meses`. Reconstruye `MONTHS` (una entrada por mes calendario entre
  START y el último día), fija `activeMonthIdx` al mes actual (o 0), actualiza `vigenciaLabel` y
  guarda la firma `CONTRACT_APPLIED = startStr + '|' + endStr` (usada por el polling para detectar
  cambios de vigencia).
- `MONTHS[i] = { year, month(0-11), key:'AAAA-MM', label }` con
  `label = new Date(y,m,1).toLocaleDateString('es-CO',{month:'long',year:'numeric'})`.

### 1.3 Tarifario por defecto (`TARIFARIO_DEFAULT`)

```js
recargos: { nocturno: 109600, dominicalFestivo: 126905 }   // COP por viaje
```

Categorías (id, label, capacidad sugerida en Ton) y rutas (id, label, valor unitario COP):

| Cat | Label | Cap. | Rutas |
|---|---|---|---|
| `cat1` | `Ítem 1 · Camión Plancha 5 Ton (largo mín. 5 m)` | 5 | `1.1` Barranquilla a su Área Metropolitana **709199** · `1.2` Barranquilla a Municipios Costero **925042** · `1.3` Barranquilla a Municipios Oriente **994095** · `1.4` Transporte entre Municipios **994095** |
| `cat2` | `Ítem 2 · Camión Plancha 8 Ton (largo mín. 6 m)` | 8 | `2.1` **709199** · `2.2` **925042** · `2.3` **994095** · `2.4` **994095** (mismos labels que cat1) |
| `cat3` | `Ítem 3 · Camión Plancha 20 Ton (largo mín. 8 m)` | 20 | `3.1` **1541736** · `3.2` **1798692** · `3.3` `Barranquilla a Municipios Oriente (ref. servicio a demanda)` **1978561** · `3.4` `Transporte entre Municipios (ref. servicio a demanda)` **1978561** |
| `cat4` | `Ítem 4 · Cama Baja 40 Ton (largo mín. 11 m)` | 40 | `4.1` **1541736** · `4.2` **1798692** · `4.3` `Barranquilla a Municipios Oriente` **1978561** · `4.4` `Transporte entre Municipios (ref. servicio a demanda)` **1978561** |

### 1.4 Festivos precargados (`FESTIVOS_DEFAULT`, Ley Emiliani — 21 fechas, no editables)

```
2026-07-20 Día de la Independencia
2026-08-07 Batalla de Boyacá
2026-08-17 Asunción de la Virgen (trasladado)
2026-10-12 Día de la Raza
2026-11-02 Todos los Santos (trasladado)
2026-11-16 Independencia de Cartagena (trasladado)
2026-12-08 Inmaculada Concepción
2026-12-25 Navidad
2027-01-01 Año Nuevo
2027-01-11 Reyes Magos (trasladado)
2027-03-22 San José (trasladado)
2027-03-25 Jueves Santo
2027-03-26 Viernes Santo
2027-05-01 Día del Trabajo
2027-05-10 Ascensión del Señor (trasladado)
2027-05-31 Corpus Christi (trasladado)
2027-06-07 Sagrado Corazón (trasladado)
2027-07-05 San Pedro y San Pablo (trasladado)
2027-07-20 Día de la Independencia
2027-08-07 Batalla de Boyacá
2027-08-16 Asunción de la Virgen (trasladado)
```
`allFestivos() = [...FESTIVOS_DEFAULT, ...ADMIN.festivosCustom]`.

### 1.5 Recargos automáticos (parámetros)

- **Nocturno**: hora de referencia = `hourAtt` (o `hourReq` si no hay atención). Es nocturno si
  `minutos >= 19*60 || minutos < 6*60` (19:00–06:00).
- **Dominical/festivo**: día de la semana 0 (domingo) o 6 (sábado), o la fecha está en `allFestivos()`.

### 1.6 Límites de peso por mes (en `saveMonth`, sobre `JSON.stringify(arr).length`)

- Modo Claude (sin Firebase): **bloqueo > 4.500.000** caracteres (~4,5 MB).
- Firebase: **bloqueo > 20.000.000** (~20 MB), **aviso con confirm > 8.000.000** (~8 MB):
  `'Aviso: este mes ya acumula X.X MB en adjuntos...'` (MB = length/1048576, 1 decimal).
- Archivo individual: se rechaza si `f.size > 20*1024*1024` (20 MB). PDF > `3*1024*1024` (3 MB)
  genera un alert de recomendación pero se adjunta.

### 1.7 Compresión de imágenes (`compressImage`)

- Parámetros: `maxW=900` px, `quality=0.62`, salida `canvas.toDataURL('image/jpeg', 0.62)`.
- Solo reduce si `width > 900` (alto proporcional redondeado). Tipo almacenado: `image/jpeg`.
- Si el navegador no decodifica la imagen (p. ej. HEIC), se adjunta el archivo original sin
  comprimir (`readFileAsDataURL`, tipo original o `application/octet-stream`).
- Se trata como imagen si `f.type` empieza por `image/`, o si no hay type y el nombre termina en
  `.(png|jpe?g|gif|webp|bmp)`. PDF detectado por type o extensión `.pdf`.

### 1.8 Semillas

`SEED_VERSION = 4`. Ver §3.4.

### 1.9 Otras constantes útiles

- `fmtCOP(n) = '$' + Math.round(n||0).toLocaleString('es-CO')`.
- Timeout genérico de storage: `withTimeout(promesa, 15000, etiqueta)` (20 s al restaurar backup);
  al fallar lanza `Tiempo de espera agotado (<etiqueta>)`.
- Paleta CSS (`:root`): `--navy:#2E3312; --navy-deep:#15170A; --teal:#C8D400; --teal-light:#F3F7CF;
  --teal-deep:#5B6900; --olive:#4A5A00; --amber:#D98E1B; --amber-light:#FBF0DC; --red:#C0392B;
  --red-light:#F8E6E4; --green:#4C8C2B; --green-light:#EAF1E1; --bg:#F4F5EC; --card:#FFFFFF;
  --line:#E2E4D4; --ink:#1B1D10; --muted:#72746A; --radius:16px`.
- Tipografías Google Fonts: Space Grotesk (títulos), Inter (cuerpo), IBM Plex Mono (cifras).
- CDNs: Chart.js 4.4.0, SheetJS xlsx 0.18.5, pdf-lib 1.17.1.
- Breakpoints: 980, 860, 800, 767, 700, 600 px. ≤767 px: sidebar oculta, `bottom-nav` fija (7
  pestañas) + FAB `＋`, tablas → tarjetas apiladas (`table.cards-md` + `td[data-l]`), modales a
  pantalla completa, safe-area iOS.

---

## 2. Capa de storage

### 2.1 Contrato `window.storage` (todas async)

- `get(key) → {key, value:string} | null`
- `set(key, value:string) → {key, value}`
- `delete(key) → {key, deleted:true}`
- `list() → {keys: string[]}`

Nota: el código llama `get/set` con un 2.º argumento booleano (`true`=compartido) heredado del
storage de Claude; el adaptador Firebase lo ignora. En `loadMonth` existe una "migración única":
si `get(key, true)` no trae datos, intenta `get(key, false)` (datos personales antiguos) y, si hay
arreglo no vacío, lo re-guarda como compartido. Bajo Firebase ambos leen la misma ruta (no-op).

### 2.2 Adaptador Firebase (REST puro, sin SDK)

- Ruta por clave: `GET/PUT/DELETE {base}/agpanel/{encodeURIComponent(key)}.json`
  (base = URL sin `/` finales).
- `list()`: `GET {base}/agpanel.json?shallow=true` → `Object.keys` con `decodeURIComponent`.
- Los valores se guardan como **string JSON** (`PUT` con body `JSON.stringify(value)` donde value
  ya es string; `get` tolera valor no-string y le aplica `JSON.stringify`).
- Errores HTTP → `throw new Error('Firebase HTTP ' + status)`.

### 2.3 Esquema de claves

- `adminconfig` — configuración/listas maestras (§3.1).
- `tarifario` — tarifario vigente (§3.2).
- `services:AAAA-MM` — arreglo de servicios de ese mes (§3.3), una clave por mes de la vigencia.

### 2.4 Backup

Archivo descargable:
```json
{ "app": "control_contrato_aaa", "version": 1, "generatedAt": "<ISO>", "keys": { "<clave>": "<string JSON>" } }
```
- Claves incluidas: siempre `adminconfig`, `tarifario` y `services:<key>` de cada mes de la
  vigencia; además, todo lo que devuelva `storage.list()` que sea `adminconfig`, `tarifario` o
  empiece por `services:`.
- Nombre de archivo: `backup_control_aaa_AAAA-MM-DD_HHMM.json`.
- Al descargar, se guarda `ADMIN.backupLastAt = generatedAt` y se muestra
  `'Última copia descargada: <fecha es-CO>'`.
- Restaurar: valida `payload.app === 'control_contrato_aaa'` y `payload.keys` objeto; confirma
  (`Se restaurarán N bloques de datos de la copia del <fecha>... Esto SOBRESCRIBE...`); hace
  `set(k, v)` por cada entrada (timeout 20 s) y `location.reload()`.

### 2.5 `waitForStorage` y banner sin backend

- `storageAvailable() = !!window.storage && typeof window.storage.set === 'function'`.
- `waitForStorage(maxWaitMs=5000)`: sondea cada 200 ms hasta que exista o venza el tiempo.
  Los load/save usan `waitForStorage(3000)`; el `init()` usa 5000.
- `storageBanner` (rojo, arriba del topbar) visible cuando `!STORAGE_OK`. Texto: advierte que se
  abrió como archivo descargado (`file://` o `C:/`) y que nada se guardará.
- Badge de sincronización: `Sin guardar (abierto fuera de Claude)` / `Sincronizando…` /
  `Sincronizado HH:MM:SS`.
- Botón `🔍 Verificar guardado`: consulta directa `get('services:<mes activo>')` y alerta con el
  número de servicios guardados en la nube.
- Handlers globales `error` y `unhandledrejection` → `alert('Ocurrió un error inesperado…')`.

### 2.6 Polling (`pollRefresh`)

- `setInterval(pollRefresh, 12000)` (12 s) + botón `🔄 Actualizar`.
- Si `isModalOpen` (modal de servicio, adminGate, adminOverlay o reportOverlay abierto) → return
  inmediato (pausa).
- Cada tick: refresca `STORAGE_OK`, banner y badge. Si hay storage:
  - `pollTick++`; si `pollTick % 5 === 1` → `loadAll()` (todos los meses, ~cada 60 s);
    si no → recarga solo el mes activo.
  - Siempre recarga `ADMIN = loadAdminFromStorage()`.
  - Si la firma `contractStart|contractEnd` difiere de `CONTRACT_APPLIED` → `applyContractDates`,
    `renderTabs()`, `loadAll()` (reconstrucción de meses).
  - `refreshAll()` y actualiza `lastSyncDate`.
- `refreshAll()` = renderStatusAndTimeline + renderKPIs + renderAlerts + renderChart +
  renderPendingSummary + renderMonthSection.

### 2.7 Carga inicial (`init`)

1. Banner + `renderTabs()` + placeholder `Cargando datos guardados…`.
2. `STORAGE_OK = await waitForStorage(5000)`.
3. `TARIFARIO = loadTarifarioFromStorage()` (si no existe, escribe el default).
4. `ADMIN = loadAdminFromStorage()` (normaliza + applySeed; si el seed cambió algo, re-guarda; si
   no existía la clave, inicializa con el default sembrado).
5. `applyContractDates(ADMIN.contractStart || '2026-07-01', ADMIN.contractEnd || '')`.
6. `renderTabs()`, `populateTarifaCategoriaSelect()`, `updateRecargoLabels()`, `loadAll()`,
   `refreshAll()`.

---

## 3. Modelo de datos

### 3.1 `adminconfig` (`ADMIN`)

```jsonc
{
  "profiles": {
    "gerencia": { "label": "Gerencia", "password": "2952" },                       // sin perms: acceso total
    "renzo":    { "label": "Renzo",    "password": "0610",
                  "perms": { "interventores": false, "areas": false, "vehiculos": false,
                             "equipos": false, "festivos": false, "personal": false } },
    "jesus":    { "label": "Jesús",    "password": "4503", "perms": { /* ídem, todo false */ } }
  },
  "interventores": ["..."],            // strings
  "areas": ["..."],                    // strings
  "vehiculos": [{ "plate", "marca"?, "tipo"?, "modelo"?, "capacity", "driver",
                  "activo"?, "venceSoat"?, "venceTecno"? }],
  "equipos":   [{ "name", "clase"?, "marca"?, "cantidad"?, "weight", "alto"?, "ancho"?, "largo"? }],
  "personal":  [{ "nombre", "cedula", "activo", "venceLicencia" }],   // venceLicencia: 'AAAA-MM-DD'|null
  "festivosCustom": [{ "date": "AAAA-MM-DD", "label": "..." }],
  "contractStart": "2026-07-01",
  "contractEnd":   "2027-08-31",
  "backupLastAt":  null | "ISO",
  "seedVersion": 4
}
```

- `normalizeAdmin(a)`: mezcla sobre `ADMIN_DEFAULT`, garantiza los 3 perfiles y, para renzo/jesus,
  el objeto `perms` completo (defaults false).
- `profileCan(sec)`: `true` si `currentProfile==='gerencia'`, si no
  `!!ADMIN.profiles[currentProfile]?.perms?.[sec]`.
- `PERM_KEYS = ['interventores','areas','vehiculos','equipos','festivos','personal']`;
  `PERM_LABELS = { interventores:'Interventores', areas:'Áreas AAA', vehiculos:'Vehículos',
  equipos:'Equipos', festivos:'Festivos', personal:'Personal' }`.
- Nota de campos de vehículo: los sembrados traen `marca`; el formulario de Flota escribe `tipo`.
  La UI muestra `v.tipo || v.marca`. Vehículo desde modal Admin: `{plate, capacity, driver}` solo.

### 3.2 `tarifario` (`TARIFARIO`)

Misma forma que `TARIFARIO_DEFAULT` (§1.3):
`{ recargos:{nocturno, dominicalFestivo}, categorias:[{id, label, capacidad, rutas:[{id, label, unitario}]}] }`.
Editable en la vista Tarifario; se guarda entero con `set('tarifario', JSON.stringify(t))`.

### 3.3 Servicio (elemento de `services:AAAA-MM`)

```jsonc
{
  "id": "s<Date.now()><random hex>",       // p.ej. "s1755000000000ab12cd" (prefijo 's')
  "date": "AAAA-MM-DD",                    // requerido; restringido al mes activo (min/max)
  "orderNo": "",                           // texto libre, placeholder "Ej. OT-0231"
  "serviceType": "Programado" | "No Programado" | "Emergencia",
  "interventor": "",                       // resuelto de select o "otro"
  "areaAAA": "",                           // ALIAS LEGADO leído en toda la app: areaSolicitante
  "plate": "", "capacity": "5.9",          // capacity/weight/value/tolls llegan como string del form
  "driver": "", "equipment": "", "weight": "",
  "pickup": "", "destination": "", "area": "",   // area = municipio/área de prestación
  "hourReq": "HH:MM", "hourAtt": "HH:MM",
  "value": "709199", "tolls": "0",
  "photo": true, "approved": false, "invoiced": false,     // checkboxes
  "notes": "",
  "photoFiles": [{ "name", "type", "dataUrl" }],           // dataUrl base64
  "approvalFile": { "name", "type", "dataUrl" } | null,    // V°B° del interventor (1 archivo)
  "tarifaCategoria": "cat1" | null,        // null si 'manual'
  "tarifaRuta": "1.1" | null,
  "approvedBy": "Gerencia",                // label del perfil; ALIAS LEGADO leído: aprobadoPor
  "approvedByKey": "gerencia",
  "approvedAt": "ISO"
}
```
Lecturas con alias legado (siempre `x.areaAAA||x.areaSolicitante` y
`x.approvedBy||x.aprobadoPor`): tabla mensual, export, reportes, PDF de orden, filtros.

### 3.4 Semillas (`applySeed`, idempotente por `seedVersion`; lo borrado NO se repone)

**v1 — áreas (6):**
`Subgerencia de Mantenimiento, Gerencia de Aseo, Subgerencia de Redes Acueducto,
Subgerencia de Redes Alcantarillado, Subgerencia de Agua Potable, Gerencia de Planeación`

**v1 — interventores (26):**
`Camilo Lozano, Jader Leyva, Carlos Bayuelo, Eva Delgado, Rafael Peña, Manuel Garcia,
Jorge Betancourt, Luis Duque Duque, Maria Jose Chois, Blanca Avila, Joaquin Escobar, Juan Lyons,
Martin Mercado, Amado Barrios, Wilfredo Perez, Horacio Caicedo, Ivan Guerra, Pablo Gonzales,
Astrid Mendoza, Oscar Palacios, Wendy Mendoza, Ernesto Subero, Claudio Vargas, Maria Cristina,
Julian Aristizabal, Alfonso Pareja Morales`

**v1 — vehículos (6):** (dedup por `plate`)

| plate | marca | capacity | driver |
|---|---|---|---|
| LZR529 | Foton (grúa planchón) | 5.9 | Hernando Peña Urueta |
| GFP832 | JAC (grúa) | 5.9 | Fredis Ahumada Gonzalez |
| GQV140 | JAC (grúa) | 5.9 | Anthony Barraza Navarro |
| QUA001 | Chevrolet NPR NA (grúa) | 3.5 | Alfonso Antonio Guerrero Antonio |
| THY171 | Internacional (Cama baja) | 35.0 | Carlos Guerra Florian |
| UFJ947 | Chevrolet Brigadier 151(Cama baja) | 35.0 | Jean Paul Rodriguez Henao |

**v2 — equipos (6):** (dedup por `name`)

| name | clase | marca | cantidad | weight | alto | ancho | largo |
|---|---|---|---|---|---|---|---|
| Mini cargador Bobcat 570 | Mini cargador | Bobcat | 1 | 3.5 | 1.97 | 1.64 | 2.65 |
| Mini excavadora 304 | Mini excavadora | Caterpillar | 1 | 4.02 | 2.5 | 1.95 | 4.93 |
| Retro Excavadora 420E | Retro cargador | Caterpillar | 2 | 8.38 | 3.57 | 2.3 | 7.43 |
| Cargador Frontal | Cargador | Caterpillar | 1 | 18.5 | 3.28 | 3.28 | 3.28 |
| Tractor topador bulldozer | Topador Bulldozer | Caterpillar | 1 | 22.5 | 3.66 | 3.66 | 3.66 |
| Excavadora | Excavadora | Caterpillar | 1 | 31 | 3.08 | 2.99 | 9.8 |

**v3 — claves definitivas:** gerencia `2952`, renzo `0610`, jesus `4503` (sobrescribe passwords).

**v4 — ficha de flota por placa** (solo rellena campos `null`) **+ `activo:true` por defecto:**

| plate | venceSoat | venceTecno | modelo |
|---|---|---|---|
| LZR529 | 2027-04-16 | 2027-04-15 | 2023 |
| GFP832 | 2026-08-19 | 2027-06-04 | 2020 |
| GQV140 | 2027-03-07 | 2027-03-13 | 2021 |
| QUA001 | 2027-07-11 | null | 1993 |
| THY171 | 2027-03-31 | 2027-06-02 | 2012 |
| UFJ947 | 2026-11-19 | 2027-01-27 | 1986 |

**v4 — personal (6 conductores, dedup por `nombre`; se crean con `activo:true, venceLicencia:null`):**

| nombre | cedula |
|---|---|
| Hernando Peña Urueta | 1143114867 |
| Fredis Ahumada Gonzalez | 1143140558 |
| Anthony Barraza Navarro | 1143156240 |
| Alfonso Antonio Guerrero Antonio | 9020267 |
| Carlos Guerra Florian | (vacía) |
| Jean Paul Rodriguez Henao | (vacía) |

Para futuras cargas: agregar bloque `if (from < 5){...}` e incrementar `SEED_VERSION`.

---

## 4. Lógica de negocio

### 4.1 Tiempo de respuesta (`respHours`)

`null` si falta `hourReq` o `hourAtt`. Si no:
`diff = (h2*60+m2) - (h1*60+m1); if (diff<0) diff += 1440; return +(diff/60).toFixed(2)` (horas,
2 decimales; asume cruce de medianoche cuando la atención es "antes" que la solicitud).

### 4.2 Recargos automáticos (`autoRecargos`, en el formulario de servicio)

- Flags `recNocturnoTouched` / `recDominicalTouched`: arrancan `false` en registro nuevo y `true`
  en edición (`openModal` con id). Cualquier cambio manual del checkbox pone el flag en `true` →
  **el desmarcado/ajuste manual prevalece** y el autocálculo deja de tocar esa casilla.
- Dominical/festivo (si `!recDominicalTouched` y hay fecha): `dow===0 || dow===6 || festivo` →
  marca el checkbox; mensaje: `festivo — <label>` | `sábado` | `domingo`.
- Nocturno (si `!recNocturnoTouched` y hay hora = `hourAtt || hourReq`): `min >= 1140 || min < 360`
  → marca; mensaje: `horario nocturno (19:00–06:00)`.
- Nota visible (`autoRecargoNote`):
  `Recargo marcado automáticamente por <msgs unidos con ' y '>. Desmárcalo si no aplica en este servicio.`
- Dispara en `change` de `date`, `hourReq`, `hourAtt`; al final llama `computeAndFillValue()`.

### 4.3 Recálculo de valor desde tarifario (`computeAndFillValue`)

- Si `tarifaCategoria` es vacío o `'manual'` → oculta hint, no toca nada.
- Si hay categoría: fija `capacity = cat.capacidad` en el formulario. Si además hay ruta:
  `total = ruta.unitario + (nocturno ? recargos.nocturno : 0) + (dominical ? recargos.dominicalFestivo : 0)`;
  escribe `value = total` y muestra hint:
  `Tarifa base: $X[+ recargo nocturno][+ recargo dominical/festivo] = $TOTAL`.
- Labels de los checkboxes se actualizan con los valores vigentes:
  `Recargo nocturno (+$109.600)` / `Recargo dominical/festivo (+$126.905)`.
- Se recalcula al cambiar categoría (repuebla rutas), ruta o cualquiera de los dos checkboxes.

### 4.4 Guardado de servicio (submit del formulario)

1. `form.checkValidity()` (solo `date` es `required`).
2. **Aprobación obligatoria**: `aprobadorSel` (gerencia/renzo/jesus) + `aprobadorClave`.
   - Sin perfil: `Selecciona el perfil que aprueba este registro (Gerencia, Renzo o Jesús).`
   - Clave ≠ `profiles[key].password`: `Clave incorrecta para <label>. El registro no se guardó.`
3. Construye el item (§3.3); `id` nuevo = `'s' + Date.now() + Math.random().toString(16).slice(2)`;
   selects "maestros" resueltos vía `resolveSel` (si valor `__otro__` → texto del input libre).
   `tarifaCategoria/tarifaRuta = null` cuando la categoría es `'manual'`.
   `approvedBy = label`, `approvedByKey = key`, `approvedAt = new Date().toISOString()` (siempre
   se re-aprueba al editar).
4. Optimista: reemplaza (edición, por id) o agrega al arreglo del mes activo; `saveMonth`.
   - OK → guarda `lastSavedItemId/lastSavedMonthKey`, cierra modal, `refreshAll()`, muestra toast
     10 s (`Servicio guardado ✓` con botones `📋 Orden de servicio`, `⬇ PDF con soportes`
     [pendientes], `⬇ Excel` [pendientes], `✕`).
   - Falla → revierte el arreglo y **deja el modal abierto** con los datos para corregir.

### 4.5 Apertura del modal (`openModal(id, dupFrom)`)

- `form.reset()`, limpia adjuntos, título `Registrar servicio` / `Editar servicio`, subtítulo =
  label del mes activo.
- `date.min/max` = primer y último día del mes activo; valor inicial = día 1.
- `aprobadorSel` preseleccionado con `currentProfile` si hay sesión admin activa.
- **Edición**: vuelca campos por `name=`; restaura adjuntos, selects (`setSelOrOtro`), conductor
  designado del vehículo, categoría/ruta; muestra nota
  `Último registro aprobado por <X> el <fecha>. Para guardar cambios se requiere aprobar de nuevo.`
  No ejecuta autoRecargos (flags touched = true).
- **Duplicado** (`dupFrom`, botón ⧉): copia
  `orderNo, serviceType, pickup, destination, area, hourReq, hourAtt, value, tolls, notes,
  capacity, weight` + interventor, areaAAA (o areaSolicitante), plate, driver, equipment,
  tarifaCategoria/tarifaRuta. **NO copia**: fecha (queda día 1 del mes), adjuntos, checkboxes
  photo/approved/invoiced, aprobación. Subtítulo añade
  `· Duplicado — revisa fecha, horas y evidencia`. Ejecuta `autoRecargos()` (es "nuevo").

### 4.6 Encadenamientos de desplegables maestros

Cada maestro es `<select id="XSel">` + `<input id="XOtro">` oculto; opción final
`__otro__` con texto `✎ Otro (digitar)` (o variante). Bases: `interventor`, `areaAAA`, `plate`,
`driver`, `equipment`.

- `interventorSel`: `— Selecciona —` + `ADMIN.interventores` + Otro.
- `areaAAASel`: + `ADMIN.areas` + `Otra (digitar)`.
- `plateSel`: vehículos con `activo!==false`, opción `PLACA · CAP T · CONDUCTOR`; `Otra placa (digitar)`.
  **change**: si la placa existe → `capacity = v.capacity` y repuebla el select de conductor con
  `v.driver` como designado.
- `driverSel`: unión de conductores de vehículos + personal activo; el designado va de primero con
  sufijo ` (designado)` y queda seleccionado; `Otro conductor (digitar)`.
- `equipmentSel`: `ADMIN.equipos`, opción `NOMBRE · CLASE · PESO T`; `Otro equipo (digitar)`.
  **change**: si existe → `weight = m.weight`.

### 4.7 Facturación por servicio

- Columna `Facturación` = botón-badge `Facturado` (verde) / `Pendiente` (ámbar);
  clic → `toggleInvoiced(id)` (optimista + saveMonth + revert si falla) sin confirmación.
- Tras exportar (CSV/XLSX/PDF, salvo cuando `opts.askInvoice === false`):
  `¿Marcar los N servicio(s) pendientes exportados como facturados?` → marca `invoiced:true` y
  guarda los meses afectados. `askInvoice:false` en: reportes analíticos y reportes por escenario.
  (Los exports del toast y los globales/mensuales SÍ preguntan.)

### 4.8 Eliminación

`¿Eliminar este registro de servicio? Esta acción no se puede deshacer.` → filtra por id,
saveMonth, revert si falla.

### 4.9 Alertas contractuales (`renderAlerts`, tarjeta del Resumen; muestra máx. 8)

Recorre todos los servicios de todos los meses:

1. **Emergencia > 3 h** (rojo): `serviceType==='Emergencia' && respHours > 3` →
   `Emergencia atendida en X h` / `<fecha> · <placa|'sin placa'> — supera el límite de 3 h (numeral 14)`.
2. **Soporte incompleto** (ámbar): `!photo || !approved` →
   `Soporte incompleto` / `<fecha> · falta [evidencia fotográfica][ y ][V°B° del interventor] (numeral 25)`.
3. **Sobrepeso** (rojo): `Number(weight) > Number(capacity)` →
   `Peso excede capacidad del vehículo` / `<fecha> · equipo X Ton en vehículo de Y Ton`.

Vencimientos (solo activos, `activo!==false`), con `dias = round((venc - hoy00:00)/86400000)`:

4. Vehículos, campos `venceSoat` (`SOAT`) y `venceTecno` (`Revisión tecnomecánica`):
   `dias < 0` → rojo al inicio (`unshift`) `<nombre> vencido` / `Vehículo <plate> — venció el <fecha>`;
   `dias <= 30` → ámbar `<nombre> por vencer` / `Vehículo <plate> — vence en N día(s) (<fecha>)`.
5. Personal, `venceLicencia`: `Licencia de conducción vencida` / `Licencia por vencer`, mismos umbrales.
6. **90 % del contrato** (rojo, unshift): `totalValue > CONTRACT_VALUE*0.9` →
   `Valor del contrato próximo a agotarse` / `Ejecutado X.X% del valor total (Cláusula Segunda)`.

Vacío: `Sin alertas activas. Los registros están completos y dentro de los tiempos contractuales.`

### 4.10 PDF "Reporte con soportes" (`buildReportPdf`, pdf-lib)

- Cabecera: imagen `HEADER_PNG_B64` (membrete AG embebido) escalada a ancho útil en cada página
  propia; fuentes Helvetica/HelveticaBold; texto sanitizado (flechas y comillas tipográficas →
  ASCII; fallback `?` para chars > 0xFF).
- **Portada** (landscape 841.89×595.28, margen 30):
  título `CUADRO DE CONTROL DE SERVICIOS DE TRANSPORTE`, subtítulo
  `Contrato IS No. 04-2026 - Transporte de Equipos y Maquinaria Propia`; metadatos:
  Contratante, Contratista, NIT Contratista (`900.530.150-5`), Vigencia del contrato,
  `Valor del contrato (IVA excl.)`, `Alcance de este reporte` (scopeLabel), `Generado el`.
  Franja de 5 KPIs: `Valor ejecutado` (del alcance), `Saldo disponible`
  (CONTRACT_VALUE − total global), `Servicios en este reporte`, `Peajes acumulados` (alcance),
  `Pendientes por facturar` (alcance). Índice: `1. Tabla resumen de servicios` /
  `2. Detalle y soportes por servicio (evidencia fotográfica y documentos adjuntos)`.
- **Tabla resumen** (landscape, filas 14 pt, cebra): columnas
  Fecha(55) · Tipo(58) · Placa(52) · Cap.T(34) · Conductor(82) · Equipo(92) ·
  Área / Destino(108, `area||destination`) · Valor(68) · Peajes(58) · Foto(28) · V°B°(28) · Fact.(34).
- **Detalle por servicio**: portada de sección y luego 1 página portrait por servicio con título
  `Servicio del <fecha> - Placa <placa> - <mes>`, 9 pares de campos (Orden/Tipo, Interventor/
  Facturado, Placa/Capacidad, Conductor/Equipo, Peso/Municipio, Recogida/Destino, Horas,
  Valor/Peajes, Evidencia `Sí (n)`/V°B° `Sí (con documento)`), Observaciones (máx. 4 líneas),
  imágenes en cuadrícula 2 columnas (alto máx. 220), y por cada PDF adjunto una página separadora
  `ANEXO ADJUNTO` + páginas del PDF copiadas (`copyPages`, `ignoreEncryption:true`).
- Pie en páginas propias: `Pagina i de N`, `Constructora Anaya Giraldo S.A.S. - Cuadro de Control
  de Contrato`, fecha de generación.

### 4.11 Orden de servicio individual (`buildOrderPdf`, botón 📋 y toast)

1 página portrait (595.28×841.89, margen 40). Título `ORDEN DE SERVICIO DE TRANSPORTE`, subtítulo
`Contrato IS No. 04-2026 - Transporte de Equipos y Maquinaria Propia a Todo Costo`, línea lima
(rgb 0.776,0.831,0.055). 20 filas etiqueta:valor (con separadores): Fecha del servicio, Mes,
N° Orden / Remisión, Tipo de servicio, Interventor / Funcionario Triple A, Área de Triple A
solicitante, `Tarifa del pliego (categoría / ruta)` (via `tarifaDescriptionFor`:
`<cat.label> — <ruta.label>` o `No aplica (tarifa manual)`), Placa, Capacidad (`X Ton`), Conductor,
Equipo / máquina transportada, Peso del equipo, Lugar de recogida, Lugar de destino,
Municipio / Área, Hora de solicitud, Hora de atención, Valor del servicio, Peajes,
`Registrado y aprobado por (AG)` (`<approvedBy> - <approvedAt es-CO>`).
Sección `Verificación de soportes` con 3 checkboxes dibujados (relleno lima si marcado):
`Evidencia fotográfica (n archivo(s))`, `V°B° del interventor[ (con documento)]`,
`Ya facturado en el sistema contable`. Observaciones (máx. 3 líneas). Dos líneas de firma:
`Firma Conductor` + `C.C.:` y `Firma Interventor / V°B°` + `C.C.:`. Pie:
`Constructora Anaya Giraldo S.A.S. - Orden de Servicio` + fecha.
Nombre de archivo: `orden_servicio_<fecha>_<placa saneada>.pdf`.

---

## 5. Vistas

Navegación: sidebar escritorio y bottom-nav móvil con `data-view` →
`VIEW_IDS = { resumen:'viewResumen', services:'viewServices', tarifario:'viewTarifario',
reportes:'viewReportes', flota:'viewFlota', personal:'viewPersonal' }`. Ítems (orden sidebar):
🏠 Resumen · 📋 Registros · 📈 Reportes · 💲 Tarifario · 🚚 Flota · 👷 Personal · ⚙ Administración
(este último abre el adminGate, no una vista). Al cambiar de vista se re-renderiza la vista
destino (chart/tarifario/reportes/flota/personal según corresponda).

Topbar (siempre visible): logo AG, estado
(`Inicia en N día(s)` / `Día X de Y · Z.Z% del plazo` [punto verde] / `Contrato finalizado`),
badge de sync + botones `🔄 Actualizar` y `🔍 Verificar guardado`, nota
`📡 Panel compartido — visible y editable por todo el equipo`, botones `＋ Registrar servicio` y
`⚙ Administración` (ocultos en móvil; ahí están el FAB y la pestaña Admin).

### 5.1 Resumen (`viewResumen`)

- **Línea de tiempo**: cinta con divisiones por mes (3 primeras letras), relleno gris =
  `% de tiempo transcurrido` (`elapsed/totalDays*100`, clamp 0-100), barra lima inferior =
  `% del valor del contrato ejecutado` (`Σ value / CONTRACT_VALUE * 100`, cap 100), marcador rojo
  `HOY` en `pctTime%` (visible solo dentro de vigencia). Subtítulo:
  `Tiempo transcurrido: X.X% · Valor ejecutado: Y.Y%`.
- **6 KPIs** (todos sobre TODOS los servicios de la vigencia):
  1. `Valor ejecutado` = Σ value; sub `X.X% del contrato`.
  2. `Valor del contrato` = fmtCOP(2891433496); sub `IVA excluido`.
  3. `Saldo disponible` = CONTRACT_VALUE − Σ value; sub `Cláusula Segunda`; clase `warn` (ámbar)
     si saldo < 10 % del contrato.
  4. `Total peajes` = Σ tolls; sub `A cargo del contratista`.
  5. `Servicios registrados` = count; sub `Acumulado del contrato`.
  6. `Sin soporte completo` = count(!photo || !approved); sub `Falta foto o V°B°`; clase `bad`
     si >0, `good` si 0.
- **Gráfica** `execChart` (Chart.js mixta): título de tarjeta `Ejecución mensual (valor
  facturado)`, sub `Julio 2026 — Agosto 2027 · barra = ejecutado del mes · línea = presupuesto
  mensual promedio`. Labels `Jul 26`-style (`mes.slice(0,3) + ' ' + año.slice(2)`). Dataset bar
  `Ejecutado` = Σ value por mes, color `#C6D40E`, borderRadius 5, maxBarThickness 28. Dataset line
  `Presupuesto promedio mensual` = constante `CONTRACT_VALUE / MONTHS.length`, `#3A3A3C`,
  dash [6,4], sin puntos. Eje Y ticks `'$'+(v/1e6).toFixed(0)+'M'`.
- **Alertas de cumplimiento**: sub `Generadas a partir de las cláusulas del contrato` (ver §4.9).
- **Tarjeta de exportación global**: `Servicios pendientes por facturar en todo el contrato: N ·
  Valor pendiente: $X`; checkbox `Incluir ya facturados` (`includeInvoicedGlobal`); botones
  `⬇ CSV`, `⬇ Excel`, `⬇ PDF con soportes` (archivo `servicios_contrato_completo.*`, scope
  `Todo el contrato`, con pregunta de facturación) y `🧾 Reporte por escenario` (abre modal §5.8).

### 5.2 Registros / Servicios (`viewServices`)

- Pestañas: un botón por mes de la vigencia (label completo `julio de 2026`…), activa =
  `activeMonthIdx`.
- Toolbar del mes: `Servicios: N · Valor del mes: $X · Peajes del mes: $Y · Días del mes: N` +
  botón `+ Agregar servicio`.
- Fila de exportación mensual: checkbox `Solo pendientes por facturar` (checked por defecto) +
  `⬇ CSV` / `⬇ Excel` / `⬇ PDF con soportes` → `servicios_<AAAA-MM>.*`, scope = label del mes,
  con pregunta de facturación.
- Tabla (`cards-md`, orden por fecha asc, colspan vacío 15): columnas
  `Fecha` (dd mmm) · `Tipo` (badge: `Programado` teal / `No Progr.` ámbar / `Emergencia` rojo) ·
  `Área AAA` · `Placa` · `Cap.` (`X T`, mono) · `Conductor` · `Equipo` · `Área / Destino`
  (`area||destination`) · `Valor` (mono) · `Peajes` (mono) · `Soportes` (chips 🖼️/📄 por
  photoFile + chip verde `✔📄` del approvalFile; clic abre el adjunto en pestaña nueva vía Blob
  URL) · `V°B°` (badge Sí/No) · `Facturación` (botón-badge toggle) · `Aprobó` (approvedBy) ·
  acciones `📋` orden PDF, `⧉` duplicar, `✎` editar, `🗑` eliminar.
- Vacío: `Aún no hay servicios registrados en <mes>. Usa "Agregar servicio" para comenzar.`
- Modal de registro (§4.4-4.6): fieldsets `Servicio`, `Tarifa del pliego (opcional — calcula el
  valor automáticamente)`, `Vehículo y carga`, `Ruta`, `Tiempos de atención`, `Financiero`,
  `Evidencia fotográfica y soportes` (checkboxes `Hay evidencia fotográfica`, `V°B° del
  interventor`, `Ya facturado en el sistema contable`; input múltiple `image/*,application/pdf`
  para evidencias — al adjuntar marca photoChk — e input único para V°B° — marca apprChk;
  aviso: `Las fotos se comprimen automáticamente. Evita adjuntar PDF muy pesados (más de 3 MB)…`),
  `Observaciones`, `Aprobación del registro` (perfil + clave).

### 5.3 Tarifario (`viewTarifario`)

- Título: `Tarifario de precios (Formulario de Cantidades y Precios)`; sub: `Tarifas del pliego
  para el cálculo automático del valor de cada servicio. Edítalas si hay un otrosí u OFAC. Los
  cambios se guardan para todo el equipo.`
- Una tarjeta por categoría: h3 = label, cap `Capacidad mínima sugerida: X Ton`, una fila por ruta
  con input numérico del unitario. Tarjeta final `Recargos aplicables (cualquier categoría)` con
  `Recargo nocturno (COP)` y `Recargo dominical y festivo (COP)`.
- `Guardar tarifario` → recoge todo el formulario, `saveTarifarioToStorage`, actualiza labels de
  recargos, alerta `Tarifario guardado. Los nuevos servicios usarán estos valores.`
- `Restablecer valores del pliego` → confirm `¿Restablecer el tarifario a los valores originales
  del pliego? Se perderán los cambios manuales.` → restaura `TARIFARIO_DEFAULT` y guarda.
- Sin restricción de perfil (cualquiera puede editar el tarifario).

### 5.4 Reportes analíticos (`viewReportes`)

**12 filtros** (`rvFilteredPairs`, sobre todos los meses, incluye facturados):

| id | Label | Lógica |
|---|---|---|
| `rvDesde` | Fecha desde | `item.date < desde` excluye |
| `rvHasta` | Fecha hasta | `item.date > hasta` excluye |
| `rvTipo` | Tipo de servicio | igualdad exacta (Todos/Programado/No Programado/Emergencia) |
| `rvFacturado` | Estado de facturación | `si`=Facturado / `no`=Pendiente / vacío=Todos |
| `rvPlaca` | Placa / vehículo | includes case-insensitive |
| `rvConductor` | Conductor | includes ci |
| `rvArea` | Municipio / área | includes ci sobre `item.area` |
| `rvAreaAAA` | Área AAA solicitante | includes ci sobre `areaAAA||areaSolicitante`; datalist con áreas maestras + usadas |
| `rvInterventor` | Interventor | includes ci |
| `rvAprobador` | Aprobado por | igualdad exacta con `approvedBy||aprobadoPor` (Gerencia/Renzo/Jesús) |
| `rvValorMin` | Valor mínimo (COP) | `value < min` excluye |
| `rvValorMax` | Valor máximo (COP) | `value > max` excluye |

Botones `Limpiar filtros` y `Generar reporte`. Antes de generar:
`Ajusta los filtros y presiona «Generar reporte» para ver resultados y estadísticas.`

**Resultados** (`rvRenderTable` + `rvRenderStats`):
- Totales: `Servicios / Valor total / Peajes / Pendientes por facturar`.
- Exportación `⬇ CSV / ⬇ Excel / ⬇ PDF con soportes` → `reporte_filtrado_<AAAA-MM-DD>.*`,
  scope `Reporte filtrado - generado el <fecha>`, **sin** pregunta de facturación.
- Tabla (orden fecha asc, 9 columnas): Fecha · Tipo · Área AAA · Placa · Conductor · Municipio ·
  Valor · Facturado (badge Sí/Pendiente) · Aprobó.
- **Gráficas y tarjetas**:
  - `Valor ejecutado por mes (según filtro)`: bar Chart.js, `#C8D400`, ticks Y en fmtCOP.
  - `Distribución por tipo de servicio`: doughnut, colores `['#2E3312','#D98E1B','#C0392B']`.
  - `Top 5 vehículos por valor`: `<placa> (n serv.)` → Σ valor, desc.
  - `Top 5 conductores por servicios`: conteo desc.
  - `Distribución por municipio / área`: top 8 por conteo.
  - `Cumplimiento de soportes y emergencias`: `% con evidencia fotográfica`, `% con V°B°`,
    `Emergencias registradas`, `Emergencias atendidas en más de 3 h`,
    `Tiempo promedio de respuesta (emergencias)` (`X.X h` o `—`).
  - `Tiempo de respuesta en emergencias`: line por mes (promedio respHours de emergencias,
    `spanGaps`, tensión .25, `#2E3312`) + línea `Límite contractual (3 h)` constante 3, roja
    `#C0392B` dash [6,4].
  - `Ranking de riesgo (más incidencias)`: por servicio suma incidencias (emergencia >3 h,
    soporte incompleto, sobrepeso; una c/u); top 4 placas (`🚚`) + top 4 conductores (`👷`)
    con `N incidencia(s)`; vacío: `Sin incidencias en la selección filtrada. ✔`.
  - `Mapa de calor — servicios por día y franja horaria`: filas `Dom..Sáb` (getDay del date),
    columnas `Madrugada 00-06h / Mañana 06-12h / Tarde 12-18h / Noche 18-24h` (franja por hora de
    `hourReq`); celda vacía `#F1F2E7`, si no `rgba(74,90,0, 0.15+0.85*(v/max))`, texto blanco si
    `v > max*0.55`.

### 5.5 Flota (`viewFlota`)

- Sub: catálogo único; alimenta el desplegable de placas (capacidad y conductor se autollenan) y
  las alertas de SOAT/tecno. `Para editar se requiere sesión de Administración con permiso de
  «Vehículos».`
- Formulario (upsert por placa, `placeholder "ABC-123 (existente = actualiza)"`): Placa
  (uppercase, obligatoria), Tipo / marca (→ campo `tipo`), Capacidad (Ton), Conductor designado
  (datalist con personal activo), Estado (Activo/Inactivo), Vence SOAT, Vence tecnomecánica,
  botón `＋ Guardar vehículo`. En update solo sobreescribe campos no vacíos (excepto `activo`,
  siempre). Guard: `canEditFleet() = gerencia || profileCan('vehiculos')`; si no:
  `Para editar la flota, inicia sesión en Administración con un perfil con permiso de «Vehículos».`
- Tabla: Placa · Tipo / marca (`tipo||marca`) · Modelo · Cap. (Ton) · Conductor · SOAT ·
  Tecnomecánica · Estado (badge Activo/Inactivo; fila inactiva con opacidad .5) · 🗑.
  Semáforo de vencimiento (`fmtVencimiento`): rojo (`badge no`) si vencido, ámbar (`badge
  pending`) si ≤30 días, verde (`badge ok`) si más. Eliminar pide confirm
  `¿Eliminar este vehículo de la flota? No borra los servicios ya registrados con esa placa.`

### 5.6 Personal (`viewPersonal`)

- Análogo a Flota con permiso `personal`. Formulario (upsert por nombre): Nombre completo
  (obligatorio), N° de identificación, Vence licencia, Estado, `＋ Guardar persona`.
- Tabla: Nombre · Identificación · Vence licencia (semáforo) · Estado · 🗑. Confirm de borrado:
  `¿Eliminar esta persona del catálogo? No borra los servicios ya registrados con su nombre.`

### 5.7 Administración (modal `adminOverlay`, tras `adminGate`)

Sub: `Sesión: <badge perfil> · Listas maestras que alimentan los desplegables de «Registrar
servicio». Cada cambio se guarda de inmediato para todo el equipo.` Si el perfil no tiene ningún
permiso: `Tu perfil aún no tiene permisos asignados sobre las listas maestras. Solicita a
Gerencia que te habilite las secciones que necesitas.`

Secciones (`data-sec`), visibilidad: `permisos`, `seguridad`, `contrato`, `backup` solo gerencia;
las demás según `profileCan(sec)`:

1. **interventores** — lista con ✕ + agregar por nombre (dup: `Ese interventor ya está en la lista.`).
2. **areas** — ídem (`Esa área ya está en la lista.`).
3. **vehiculos** — lista `PLACA · marca · cap Ton · conductor` + alta rápida {plate (uppercase,
   obligatoria, dup rechazado), capacity, driver}.
4. **equipos** — lista con ficha (`clase · peso Ton · marca · Cant. n · Al×An×La m`) + alta
   {name (obligatorio, dup rechazado), weight, clase}.
5. **festivos** — chips de los 21 oficiales (no editables, title `Calendario oficial (no
   editable)`) + chips custom con ✕; alta {date obligatoria, label default `Festivo adicional`};
   dup contra `allFestivos()`: `Esa fecha ya está registrada como festivo.`
6. **contrato** — fechas inicio/fin; validaciones: solo gerencia, ambas obligatorias, fin > inicio;
   confirm `¿Actualizar la vigencia del contrato a <ini> → <fin>? El panel recalculará los meses
   visibles y la línea de tiempo.`; al guardar: saveAdmin → applyContractDates → renderTabs →
   loadAll → refreshAll → alert `Vigencia actualizada: <vigencia>.`
7. **permisos** — para `renzo` y `jesus`: 6 checkboxes (PERM_LABELS) con guardado inmediato al
   cambiar; campo `Nueva clave de <X>` + `Guardar clave` (mín. 4 caracteres:
   `La clave debe tener al menos 4 caracteres.`).
8. **seguridad** — `Nueva contraseña` del perfil en sesión (pensada para gerencia; mín. 4:
   `La contraseña debe tener al menos 4 caracteres.`).
9. **backup** — `⬇ Descargar copia` / `⬆ Restaurar desde copia` + última fecha (§2.4).

Pie del modal: `Cambiar de perfil` (cierra, borra sesión y reabre el gate) y `Cerrar`.

### 5.8 Reporte por escenario (modal `reportOverlay`)

- Selector `Escenario`: `Por día` (input date, default hoy) / `Por vehículo` (select de placas:
  usadas en servicios ∪ flota, uppercase, ordenadas) / `Por área solicitante (AAA)` (select:
  áreas usadas [solo campo `areaAAA`] ∪ maestras, ordenadas).
- Checkbox `Incluir servicios ya facturados` (checked).
- Predicados: día → `it.date === f`; vehículo → `upper(it.plate) === p`; área →
  `(it.areaAAA||'') === a` (igualdad exacta; **no** considera el alias `areaSolicitante`).
- Orden: por fecha y luego `hourReq`. Sin resultados:
  `No se encontraron servicios para ese criterio.`
- Archivos/scope: `reporte_dia_<fecha>` / `Reporte por día - <fecha>`;
  `reporte_vehiculo_<slug>` / `Reporte por vehículo - Placa <P>`;
  `reporte_area_<slug>` / `Reporte por área AAA - <A>`. `slugify` = NFD sin diacríticos,
  no-alfanumérico → `_`, lowercase. Sin pregunta de facturación.

### 5.9 Exportaciones — formato común

- `toExportRow` (CSV y XLSX, 26 columnas en este orden literal):
  `Mes, Fecha, N° Orden / Remisión, Tipo de Servicio, Área AAA solicitante, Placa Vehículo,
  Capacidad Vehículo (Ton), Conductor, Equipo Transportado, Peso Equipo (Ton), Lugar de Recogida,
  Lugar de Destino, Municipio / Área, Hora Solicitud, Hora Atención, Tiempo de Respuesta (h),
  Interventor, Valor Servicio (COP), Peajes (COP), Evidencia Fotográfica, V°B° Interventor,
  Facturado, Aprobado por (AG), Fecha de aprobación,
  Adjuntos (solo nombres — ver PDF para el contenido), Observaciones`.
  Booleanos como `Sí`/`No`; capacidades/pesos/valores como Number (valor/peajes 0 si vacío);
  fecha de aprobación `toLocaleString('es-CO')`; adjuntos = nombres unidos con ` | `.
- CSV: separador `;`, campos entre comillas (comillas dobladas), BOM `\uFEFF`, saltos `\r\n`,
  mime `text/csv;charset=utf-8;`.
- XLSX: `XLSX.utils.json_to_sheet` → hoja `Servicios` → `XLSX.writeFile`.
- PDF: §4.10. Sin registros: `No hay servicios para exportar con los filtros seleccionados.`

---

## 6. Perfiles y seguridad funcional

> **Decisión AG (módulo nativo, 2026-08): identidad por login de plataforma (Supabase
> Auth); aislamiento por rol.** El módulo Next.js NO pide claves ni muestra selectores:
> `lib/transporte/session.tsx` consume el ROL de la sesión de la plataforma (página
> /login + middleware + tabla de usuarios con rol gerencia/jesus/renzo, construidos
> aparte; hoy un stub provisional "gerencia"). La aprobación de servicios sella con el
> rol activo sin clave. La matriz de permisos `perms` se mantiene y gobierna qué ve y
> edita cada rol (secciones exclusivas de gerencia ocultas para los demás; Flota y
> Personal en solo lectura sin permiso). Las claves descritas a continuación son el
> comportamiento del HTML original y se conservan en los datos solo por compatibilidad.


- **Perfiles fijos**: `gerencia` (label `Gerencia`, clave `2952`), `renzo` (`Renzo`, `0610`),
  `jesus` (`Jesús`, `4503`). Claves editables (mín. 4 caracteres); persisten en texto plano dentro
  de `adminconfig` (nodo Firebase abierto por URL — riesgo documentado; mitigación: URL no
  pública/uso interno; endurecimiento recomendado: Firebase Auth + reglas, o backend con sesión).
- **Matriz de permisos**: gerencia = todo (incluye secciones exclusivas `contrato`, `permisos`,
  `seguridad`, `backup`). renzo/jesus = solo las secciones con `perms[sec]===true` entre
  interventores/areas/vehiculos/equipos/festivos/personal (todas false por defecto en el código;
  en producción gerencia les habilita — p. ej. `vehiculos:true` según la documentación técnica).
- **Flujo adminGate**: botón ⚙ → si `adminUnlocked` abre directo el panel admin; si no, modal con
  select de perfil + clave (Enter envía). Clave errónea:
  `Clave incorrecta para el perfil seleccionado.` Éxito → `currentProfile = perfil`,
  `adminUnlocked = true`, abre adminOverlay. `Cambiar de perfil` resetea sesión. La sesión vive en
  memoria (se pierde al recargar).
- **Aprobación de servicios**: independiente del adminGate — cada guardado exige perfil + clave en
  el propio formulario (§4.4) y estampa `approvedBy/approvedByKey/approvedAt`.
- **Flota/Personal**: mutaciones requieren `currentProfile==='gerencia'` o permiso
  `vehiculos`/`personal` (la vista es visible para todos; solo editar está protegido).
- Sin protección: registrar/editar/eliminar servicios (más allá de la clave de aprobación),
  tarifario, exportaciones, toggle de facturado.

---

## 7. Detalles de UI transversales

- Toast (10 s auto-cierre): `Servicio guardado ✓` / `Descarga la orden de servicio para imprimir,
  o la información pendiente por facturar.` + `📋 Orden de servicio` (del último guardado),
  `⬇ PDF con soportes` y `⬇ Excel` (colección de pendientes de TODO el contrato,
  `servicios_pendientes_facturar.*`, con pregunta de facturación), `✕`.
- Adjuntos en tabla: `openAttachment` convierte dataUrl → Blob → `window.open(objectURL)` y revoca
  a los 60 s.
- `escapeHtml` en todo render de datos de usuario.
- Footer: `Cuadro de control compartido · Los datos se guardan en la nube del panel y se
  sincronizan entre todos los usuarios · Basado en el Contrato IS No. 04-2026`.
- Sidebar foot: `Contrato IS No. 04-2026 / Panel compartido en tiempo real`.
- Título del documento: `Cuadro de Control · AG Constructora`.
- Dos imágenes base64 embebidas: logo AG (sidebar + topbar, líneas 354/380) y membrete PDF
  `HEADER_PNG_B64` (línea 1187).

---

## 8. Inconsistencias y peculiaridades detectadas (preservar o corregir conscientemente)

1. La barra del chart de ejecución usa `#C6D40E`, ligeramente distinto del token `--teal #C8D400`
   (el chart de reportes sí usa `#C8D400`).
2. El reporte por escenario "área" filtra solo `it.areaAAA` (ignora el alias legado
   `areaSolicitante`, que sí se respeta en el resto de la app).
3. `capacity`, `weight`, `value`, `tolls` se guardan como **string** (FormData); los cálculos
   siempre hacen `Number(...)`.
4. `respHours` suma 1440 min a diferencias negativas: una atención "anterior" a la solicitud se
   interpreta como cruce de medianoche, nunca como error.
5. En el PDF de reporte, el KPI `Valor ejecutado` es del alcance filtrado pero `Saldo disponible`
   se calcula contra el total global de todo el contrato.
6. `openModal` fija la fecha por `new Date(y,m,d).toISOString().slice(0,10)` — en husos horarios
   negativos (Colombia UTC-5) esto puede correr un día el min/max/valor por el paso a UTC.
7. La documentación técnica muestra `vehiculos:true` para Renzo, pero el default del código es
   todo `false`; ese true es estado de producción configurado por gerencia, no semilla.
8. Al ejecutarse bajo Firebase, el 2.º parámetro de `storage.get/set` (compartido/personal) es
   ignorado; la "migración de datos personales" en `loadMonth` queda inocua.
9. El toggle de facturación y el borrado no piden clave de perfil (solo confirm en el borrado).
10. `TODAY` se captura una sola vez al cargar; un panel abierto varios días no mueve el marcador
    HOY hasta recargar.

---

## 9. Índice de líneas (archivo original `public/transporte-aaa.html`, 3.297 líneas)

| Módulo | Líneas aprox. |
|---|---|
| `<head>`, CDNs, CSS completo (`:root` 13-23; responsive/móvil 301-347) | 1–348 |
| Shell: sidebar 352-365 · storageBanner 369-376 · topbar 378-400 | 349–400 |
| HTML viewResumen (timeline, KPIs, chart, alertas, export global) | 402–449 |
| HTML viewServices (tabs + section) | 451–454 |
| HTML viewTarifario | 456–474 |
| HTML viewReportes (12 filtros + resultados + tarjetas de stats) | 476–535 |
| HTML viewFlota | 537–559 |
| HTML viewPersonal | 561–578 |
| Footer, bottom-nav, FAB | 580–594 |
| Modal de servicio (`overlay`/`serviceForm`) | 596–729 |
| Modal adminGate | 731–748 |
| Modal adminOverlay (secciones admin) | 750–853 |
| Modal reportOverlay (escenarios) | 855–877 |
| Toast | 879–888 |
| Config Firebase + adaptador `window.storage` | 890–930 |
| Constantes de contrato, MONTHS, applyContractDates | 932–979 |
| TARIFARIO_DEFAULT | 981–1010 |
| FESTIVOS_DEFAULT, PERM_KEYS, ADMIN_DEFAULT, normalizeAdmin, profileCan | 1012–1073 |
| SEED_VERSION/SEED_DATA/applySeed | 1075–1134 |
| Estado global, helpers (fmtCOP, escapeHtml), waitForStorage, error handlers | 1135–1184 |
| HEADER_PNG_B64 + b64ToBytes | 1186–1195 |
| Capa storage: loadMonth/saveMonth/tarifario/admin/loadAll | 1197–1312 |
| Adjuntos: compressImage, processSelectedFiles, previews, openAttachment | 1314–1415 |
| Estado/timeline + sync badge | 1417–1449 |
| respHours + KPIs | 1451–1481 |
| Alertas | 1483–1524 |
| Gráfica de ejecución | 1526–1545 |
| Export/facturación: collectAllItems, toExportRow, CSV, markExportedAsInvoiced, exportData | 1547–1635 |
| PDF reporte con soportes (buildReportPdf/Browser) | 1637–1899 |
| Orden de servicio PDF (buildOrderPdf/downloadServiceOrder) | 1901–2035 |
| Tarifario UI + computeAndFillValue + updateRecargoLabels | 2037–2100 |
| Desplegables maestros (populate*/toggleOtro/resolveSel/setSelOrOtro) | 2102–2154 |
| autoRecargos | 2156–2184 |
| Administración: listas, permisos, contrato, gate, claves | 2186–2390 |
| Copia de seguridad (descarga/restauración) | 2392–2465 |
| Tabs + tabla mensual + toggleInvoiced/deleteItem | 2467–2600 |
| Modal servicio JS (openModal, listeners, submit) | 2602–2812 |
| Navegación de vistas (switchView) | 2814–2831 |
| Flota | 2833–2898 |
| Personal | 2900–2942 |
| Reportes analíticos (filtros, tabla, stats, heatmap, charts) | 2944–3127 |
| Export global + reportes por escenario + toast handlers | 3129–3217 |
| refreshAll, pollRefresh (12 s), verifyStorageNow, init | 3219–3293 |
