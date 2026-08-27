# Despliegue — pasos manuales pendientes

Todo el código de autenticación y del panel de Transporte AAA ya está en el repo
y compila. Falta SOLO lo siguiente, en este orden, para dejar la plataforma
operando con login real y datos reales:

## 1. Crear las tablas en Supabase (SQL Editor)

En el proyecto Supabase de la constructora → **SQL Editor**, ejecutar:

1. `supabase/usuarios.sql` — tabla `usuarios` (rol de plataforma) + RLS.
2. `supabase/transporte_kv.sql` — tabla clave-valor del panel de Transporte AAA
   (si no se ejecutó ya).

## 2. Crear las cuentas de usuario

1. Editar `scripts/crear-usuarios.ts` y reemplazar los placeholders de `CONFIG`
   (`EMAIL_PENDIENTE_GERENCIA`, `EMAIL_PENDIENTE_RENZO`, `EMAIL_PENDIENTE_JESUS`
   y las contraseñas `CAMBIAR-...`) por los correos y claves reales.
   Roles: `gerencia` = administrador total; `renzo` y `jesus` = perfiles
   operativos de Transporte (sus permisos finos salen de la matriz de
   Administración del panel).
2. Ejecutar (con las variables de `.env.local` en el entorno):

   ```bash
   export $(grep -v '^#' .env.local | xargs)   # o exportar las 2 variables a mano
   npx tsx scripts/crear-usuarios.ts
   ```

   El script es idempotente: re-ejecutarlo no duplica cuentas ni cambia
   contraseñas existentes; solo re-upserta la fila de `usuarios`.

## 3. Migrar los datos reales de Transporte (Firebase → Supabase)

```bash
npx tsx scripts/migrar-transporte.ts
```

(Única vez; idempotente. Requiere las mismas variables de entorno.)

## 4. Verificación final

- Entrar a la app sin sesión → debe redirigir a `/login`.
- Iniciar sesión con cada cuenta y comprobar: gerencia ve todo; renzo/jesus
  solo lo que su matriz de permisos habilita en Transporte AAA.
- El pie de la barra lateral muestra nombre y rol, con "Cerrar sesión".

> Nota: el login exitoso NO se pudo probar en desarrollo hasta ejecutar los
> pasos 1 y 2 (no existen aún la tabla `usuarios` ni las cuentas). Lo demás
> (redirecciones del middleware, diseño de `/login`, error inline con
> credenciales inválidas) quedó verificado con Playwright
> (`docs/transporte-aaa/capturas/05-login.png` y `05b-login-error.png`).
