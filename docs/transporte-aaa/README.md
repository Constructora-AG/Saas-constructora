# Control Transporte AAA — Cuadro de Control del Contrato IS No. 04-2026

Panel web compartido de AG Constructora S.A.S. para la gestión operativa y financiera del
contrato de Transporte de Equipos y Maquinaria con Triple A (valor $2.891.433.496 COP,
vigencia editable, base 01-jul-2026 → 31-ago-2027).

**Versión:** fusión completa (agosto 2026) · **Autoría funcional:** Gerencia AG Constructora

---

## 1. Qué contiene este paquete

| Archivo | Descripción |
|---|---|
| `Control transporte aaa.html` | **Todo el código fuente.** Aplicación completa en un solo archivo (HTML + CSS + JavaScript). No requiere compilación ni build. |
| `README.md` | Este documento: despliegue en distintas arquitecturas. |
| `docs/DOCUMENTACION_TECNICA.md` | Arquitectura interna, modelo de datos, módulos, seguridad y puntos de extensión. |
| `config/firebase-rules.json` | Reglas de seguridad para Firebase Realtime Database. |
| `adaptadores/adaptador-rest-generico.js` | Plantilla para conectar la app a **otro backend** (API propia, SQL, Supabase, etc.). |

## 2. Arquitectura en una frase

**SPA de archivo único** (sin framework, sin build) + **capa de almacenamiento intercambiable**
(`window.storage`) que hoy apunta a **Firebase Realtime Database vía REST**. El HTML es la
"carcasa"; todos los datos viven en la base de datos. Actualizar el archivo desplegado **no**
borra información.

```
┌─────────────────────────────┐        REST (fetch)        ┌──────────────────────────┐
│  Control transporte aaa.html │  ───────────────────────▶ │ Firebase Realtime DB      │
│  (Netlify / cualquier host   │  GET/PUT /agpanel/<clave> │ nodo: /agpanel            │
│   de archivos estáticos)     │  ◀───────────────────────  │ claves: adminconfig,      │
│  3 perfiles con clave        │      sondeo cada 12 s      │ tarifario, services:AAAA-MM│
└─────────────────────────────┘                            └──────────────────────────┘
```

Dependencias externas (CDN, sin instalación): Chart.js 4.4.0 · SheetJS (xlsx) 0.18.5 · pdf-lib 1.17.1
· Google Fonts (Space Grotesk, Inter, IBM Plex Mono). Se requiere internet para cargarlas.

## 3. Configuración (un solo punto)

Abrir el HTML y localizar al inicio del `<script>`:

```js
const FIREBASE_DATABASE_URL = 'https://control-transporte-aaa-default-rtdb.firebaseio.com';
```

- **Con URL** → la app usa esa Realtime Database (producción actual).
- **Vacía ('')** → la app usa el almacenamiento de artefactos de Claude (solo dentro de Claude).
- **Otro backend** → ver sección 6.

Claves de perfil vigentes (cámbielas tras el despliegue desde Administración):
Gerencia **2952** · Jesús **4503** · Renzo **0610**. Solo Gerencia puede cambiar claves.

## 4. Preparar Firebase (una sola vez por entorno)

1. https://console.firebase.google.com → **Agregar proyecto** (sin Analytics).
2. Compilación → **Realtime Database** → Crear (us-central1) → modo bloqueado.
3. Pestaña **Reglas** → pegar el contenido de `config/firebase-rules.json` → Publicar.
4. Copiar la URL de la base (formato `https://<proyecto>-default-rtdb.firebaseio.com`)
   y pegarla en `FIREBASE_DATABASE_URL`.

> Nota de seguridad: estas reglas dejan el nodo `/agpanel` legible/escribible para quien
> conozca la URL. Es un esquema aceptable para uso interno de equipo; para exposición
> pública implemente Firebase Auth (ver documentación técnica, §8).

## 5. Despliegue por plataforma

La app es un archivo estático: sirve en **cualquier** hosting de archivos. Casos:

### 5.1 Netlify (actual)
`app.netlify.com` → *Add new site* → *Deploy manually* → arrastrar una carpeta que contenga
el archivo **renombrado a `index.html`**. Actualizaciones: pestaña *Deploys* → arrastrar de nuevo.

### 5.2 Vercel
`vercel.com/new` → *Deploy* sin framework (Other) → subir carpeta con `index.html`.
O por CLI: `vercel --prod` dentro de la carpeta.

### 5.3 GitHub Pages
Repositorio → subir el archivo como `index.html` → *Settings → Pages* → Branch `main` / root.
URL: `https://<usuario>.github.io/<repo>/`.

### 5.4 Servidor propio — Nginx
```nginx
server {
  listen 80;
  server_name panel.suempresa.com;
  root /var/www/control-aaa;      # contiene index.html
  index index.html;
  location / { try_files $uri /index.html; }
}
```
Copiar el archivo: `cp "Control transporte aaa.html" /var/www/control-aaa/index.html`.
Recomendado: certificado TLS con certbot (`certbot --nginx`).

### 5.5 Servidor propio — Apache
Copiar como `index.html` en el `DocumentRoot`. No requiere `.htaccess` especial.

### 5.6 IIS (Windows Server)
Crear sitio → carpeta física con `index.html` → asegurarse de que el MIME `.html` esté activo
(lo está por defecto). 

### 5.7 AWS S3 + CloudFront
Bucket con *Static website hosting* → subir como `index.html` → política pública de lectura o
distribución CloudFront con OAC. 

**En todos los casos** el único requisito real es servir el archivo por **HTTPS o HTTP** y que
los usuarios tengan salida a internet hacia Firebase y los CDN.

## 6. Desplegar sobre OTRA base de datos (no Firebase)

La app solo usa el contrato `window.storage` (4 funciones: `get`, `set`, `delete`, `list`).
Pasos:

1. Implemente un backend con los 4 endpoints descritos en `adaptadores/adaptador-rest-generico.js`
   (incluye SQL de referencia para una tabla clave-valor).
2. En el HTML, reemplace el bloque `initFirebaseStorage()` por el adaptador ajustado,
   o cargue el adaptador antes del script principal.
3. Deje `FIREBASE_DATABASE_URL = ''` para que el bloque Firebase no se active.

Con eso, TODO lo demás (perfiles, reportes, backups, sincronización) funciona sin cambios.

## 7. Migración de datos entre entornos

1. En el entorno origen: Administración (Gerencia) → **Copia de seguridad → Descargar copia**
   (archivo JSON con el 100 % de los datos, evidencias incluidas).
2. En el entorno destino (nueva base/URL ya configurada): **Restaurar desde copia** → seleccionar
   el JSON → confirmar. La app escribe todas las claves y se recarga.

## 8. Operación y mantenimiento

- **Actualizar la app:** reemplazar el archivo en el hosting. Los datos no se tocan.
- **Copia de seguridad:** semanal y antes de cada actualización (10 segundos).
- **Sincronización:** cada usuario refresca el mes activo cada 12 s y todo el contrato cada 60 s.
- **Límites de peso por mes:** aviso a los 8 MB, tope a los 20 MB (fotos comprimidas a ~900 px).
- **Soporte de navegadores:** Chrome/Edge/Safari/Firefox actuales, escritorio y móvil
  (interfaz de escritorio con barra lateral; interfaz móvil automática con navegación inferior).

Para el detalle interno (modelo de datos, módulos, migraciones `seedVersion`, seguridad),
ver `docs/DOCUMENTACION_TECNICA.md`.
