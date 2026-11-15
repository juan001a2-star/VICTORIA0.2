# Banca Victoria — correcciones aplicadas

## Base v27
- PostgreSQL fuente de verdad; login cookie HttpOnly; roles; scrypt; transacciones en venta/anulación; límites en servidor; seed idempotente.

## Teclado (VenderScreen)
- Rápida / Compartir: tamaño de DEL, solo símbolo.
- OK (antes +): 1 toque = agregar jugada; doble toque = menú rápido.
- Nueva tecla + para cadenas de dígitos; cursor ◀ ▶ en números.
- Monto solo enteros; foco vuelve a números tras agregar jugada.

## Contabilidad
- Línea "Pago de crédito de venta" separada de créditos de premio.

## Roles
- Supervisor no crea usuarios ni grupos; solo modifica/bloquea los de su grupo.
- Supervisor y cobrador solo ven usuarios de su grupo.
- Crear/eliminar grupos solo admin.

## Admin — reset contabilidad (Configuración)
- Reset usuario / grupo / sistema completo (borra tickets, plays, ajustes; mantiene entidades).
- UI en panel Configuración con confirmaciones.

## Reportes administrativos reorganizados
- Ventas, Comisiones, Premios pagados, Cobro de ventas, Total pérdida/ganancia.
- Admin: filtros por fecha, grupo y usuario.
- Supervisor/cobrador: datos de su grupo.
- Desglose por vendedor.

## Configuración (todos los usuarios)
- Notificaciones, idioma, placeholders color/icono/contraseña/huella, filtro tickets abierto/cerrado.

Todas las cadenas nuevas en ES / FR / EN.

Despliegue: DATABASE_URL, APP_SECRET → npm install → npm run db:push → npx tsx db/seed.ts → npm run build → npm start.

## Configuración real (v30)
- **Cambio de contraseña**: endpoint `changePassword` (verifica contraseña actual, hashea con scrypt).
- **Notificaciones**: preferencias en localStorage; pide permiso del navegador; dispara al pagar premio o crédito de venta.
- **Color de tema**: 5 colores persistidos y aplicados al cargar la app.
- **Huella dactilar**: registro WebAuthn (biometría de plataforma) cuando el dispositivo lo soporta; se puede activar/desactivar.

## v50 — Zona horaria EE.UU. y nueva lista de loterías
- **Zona horaria del programa**: cambiada de `America/Cayenne` a `America/New_York`.
  - El reloj del sistema (apertura/cierre de ventas) usa ahora la hora de Nueva York.
  - Cuando EE.UU. cambia de horario de verano (DST) a invierno o viceversa, el cierre de las loterías americanas (New York, Florida, etc.) se ajusta automáticamente según la hora local de NY.
- **Nueva lista de loterías por defecto** (seed):
  - República Dominicana: Loteria Nacional Noche/Tarde, Leidsa, Loteria Real, Loteka, La Primera, La Suerte, LoteDom (con soporte de `schedule` por día lun–dom).
  - Anguila: 9:00 AM (cierre 08:25), 10:00 AM (09:25), 1:00 PM (12:25), 9:00 PM (20:25). Apertura 06:00.
  - Haití: 9:30 AM (cierre 08:55), 7:30 PM (18:55). Apertura 06:00.
  - King Día (cierre 11:55), King Noche (cierre 18:55). Apertura 06:00.
  - EE.UU.: New York Tarde/Noche, Florida Tarde/Noche (horarios en zona New York).
- Función de hora renombrada a `getAppNow()` en ticket-router.
- Nota: el seed solo inserta si la tabla de loterías está vacía. En instalaciones ya existentes, actualizar/crear loterías desde el panel de administración o re-sembrar si se desea la lista nueva.
