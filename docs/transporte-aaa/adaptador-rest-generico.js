/* ============================================================================
   ADAPTADOR DE ALMACENAMIENTO GENÉRICO — Control Transporte AAA
   ----------------------------------------------------------------------------
   La aplicación NO depende de Firebase: depende únicamente del contrato
   `window.storage` descrito abajo. Para desplegar sobre otra arquitectura
   (API REST propia, Supabase, PostgreSQL detrás de un backend, SharePoint,
   etc.), implemente estas 4 funciones y defina `window.storage` ANTES de que
   corra el script principal (o reemplace el bloque `initFirebaseStorage()`
   dentro del HTML por este archivo adaptado).

   CONTRATO (todas las funciones son async):

   get(key)            -> { key, value }  donde value es SIEMPRE un string
                          (la app guarda JSON serializado). Si la clave no
                          existe: devolver null o lanzar Error.
   set(key, value)     -> { key, value }. value llega como string. Persistirlo
                          tal cual (texto plano / TEXT / varchar largo).
   delete(key)         -> { key, deleted:true }
   list()              -> { keys: [ ...todas las claves existentes... ] }
                          (usado por la copia de seguridad; si su backend no
                          puede listar, devuelva al menos las claves conocidas)

   CLAVES USADAS POR LA APLICACIÓN:
   - "adminconfig"          -> configuración completa (perfiles, listas, flota,
                               personal, festivos, fechas del contrato)
   - "tarifario"            -> tarifas y recargos
   - "services:YYYY-MM"     -> arreglo de servicios del mes (una clave por mes)

   TAMAÑOS: un mes con evidencias fotográficas puede pesar varios MB (las
   fotos van embebidas en base64). Dimensione el campo de texto en
   consecuencia (>= 20 MB recomendado) o ajuste los límites en saveMonth().
   ============================================================================ */

const API_BASE = 'https://SU-BACKEND.ejemplo.com/api/storage'; // <- AJUSTAR

window.storage = {
  async get(key){
    const r = await fetch(`${API_BASE}/${encodeURIComponent(key)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();            // se espera { key, value }
    return { key, value: String(data.value) };
  },
  async set(key, value){
    const r = await fetch(`${API_BASE}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return { key, value };
  },
  async delete(key){
    const r = await fetch(`${API_BASE}/${encodeURIComponent(key)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return { key, deleted: true };
  },
  async list(){
    const r = await fetch(`${API_BASE}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();            // se espera { keys: [...] }
    return { keys: data.keys || [] };
  }
};

/* SQL de referencia para un backend mínimo (PostgreSQL / MySQL):

   CREATE TABLE app_storage (
     k   VARCHAR(200) PRIMARY KEY,
     v   LONGTEXT NOT NULL,          -- o TEXT en PostgreSQL
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   Endpoints requeridos:
   GET    /api/storage            -> { "keys": ["adminconfig", ...] }
   GET    /api/storage/:k         -> { "key": k, "value": "..." } | 404
   PUT    /api/storage/:k         -> guarda { "value": "..." }
   DELETE /api/storage/:k
*/
