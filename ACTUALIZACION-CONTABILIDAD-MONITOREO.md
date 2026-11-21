# Actualización Banca Victoria — Contabilidad y Monitoreo

## Contenido integrado
- Nuevo módulo de Contabilidad y Monitoreo para administradores y supervisores.
- Resumen de ventas, tickets, comisiones y premios.
- Resumen por grupo y vendedor.
- Totales por tipo de jugada y detalle de números/combinaciones.
- Listado y consulta del detalle de tickets, con estados y motivo de anulación.
- Motivo obligatorio al anular tickets.
- Notificaciones persistentes para el vendedor y administradores/supervisores cuando un ticket se anula o resulta ganador.

## Compatibilidad de base de datos
La aplicación original usa `lottery_users`, `tickets` y `plays`. El paquete de referencia esperaba `usuarios`, `ticket_jugadas` y `bancas`; por eso se adaptaron las funciones al esquema real, sin ejecutar esa migración incompatible.

La columna `tickets.annul_reason` y la tabla `notifications` se agregan mediante:
- `migrations/20261120_contabilidad_monitoreo.sql`
- `db/ensure-schema.ts` (se ejecuta durante el arranque de producción).

## Publicación en GitHub y Render
1. Haz una copia de seguridad de la base de datos PostgreSQL de Render.
2. Descomprime este paquete en una copia local del repositorio original (no borres la carpeta `.git` del repositorio original).
3. Revisa los cambios y ejecuta `npm ci`, `npm run check`, `npm run lint` y `npm run build`.
4. Prueba con una base de datos de prueba: monitoreo por fechas, grupo/vendedor, anulación con motivo y notificaciones al ganador.
5. Copia los cambios al repositorio original, ejecuta `git add .`, `git commit` y `git push origin main`.
6. Render debería desplegar automáticamente si el servicio ya tiene habilitado Auto-Deploy. Revisa los logs y la ruta de salud `/api/trpc/ping`.

## Importante
Este paquete conserva la configuración existente de Render (`render.yaml`), Docker y los scripts de inicio. No contiene credenciales ni modifica el repositorio remoto. No se pudo completar una compilación local en este entorno porque la instalación de dependencias (`npm ci`) excedió el tiempo disponible; es necesario ejecutar las comprobaciones indicadas antes de producción.
