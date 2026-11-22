# Actualización: Contabilidad, Monitoreo, Tickets y Notificaciones

**Fecha:** 22 de noviembre 2026  
**Base:** Banca-Victoria-v50-horarios-automaticos  
**Fuente de diseño:** paquete `banca-contabilidad-monitoreo`

---

## Qué se implementó

### 1. Base de datos
- Columna `annul_reason` en `tickets` (motivo obligatorio al anular).
- Columna `processed_at` en `tickets`.
- Columnas `is_winner` y `prize` en `plays`.
- Nueva tabla `notifications`.
- Migración SQL: `db/migrations/001_contabilidad_monitoreo.sql`
- `db/ensure-schema.ts` actualizado (se aplica automáticamente al arrancar en Render).

### 2. Backend
- `ticket.annul` ahora **exige** `reason` (mínimo 3 caracteres) y lo guarda.
- Nuevo endpoint `report.monitoring`:
  - Filtros: rango de fechas + vendedor opcional.
  - Resumen: total vendido, tickets, comisiones, premios.
  - Por tipo de jugada (Directo, Palé, Tripleta, etc.).
  - Detalle por número/combinación.

### 3. Frontend
- **Pantalla Contabilidad y Monitoreo** (`MonitoreoScreen`):
  - Visible solo para `admin` y `supervisor`.
  - Cards de resumen + lista por tipo + detalle por número (ordenable).
- Menú lateral: nuevo ítem **“Contabilidad y Monitoreo”**.
- **Tickets**:
  - Al anular se pide motivo obligatorio.
  - En el detalle se muestra el motivo de anulación.
  - Visible también para admin/supervisor (gestión).

### 4. Documentación incluida
- `docs/DISEÑO_COMPLETO.md` – diseño original de UI y reglas de negocio.
- `docs/monitoreo.sql`, `docs/tickets.sql`, `docs/notificaciones.sql` – consultas de referencia.

---

## Cómo desplegar en Render / GitHub

1. **Base de datos (recomendado):**
   ```bash
   psql $DATABASE_URL -f db/migrations/001_contabilidad_monitoreo.sql
   ```
   O simplemente haz redeploy: `ensure-schema.ts` creará las columnas/tablas al arrancar.

2. **Código:**
   ```bash
   git add .
   git commit -m "feat: Contabilidad, Monitoreo, motivo de anulación y notificaciones (schema)"
   git push origin main
   ```
   Render hará redeploy automático si está conectado al repo.

3. **Verificación:**
   - Inicia sesión como admin/supervisor → menú → “Contabilidad y Monitoreo”.
   - Anula un ticket y comprueba que pide motivo y lo guarda.
   - Revisa filtros por fecha y vendedor en Monitoreo.

---

## Pendiente / siguientes pasos (opcional)

- Campanita de notificaciones en la barra superior + pantalla de lista (tabla ya existe).
- Al procesar sorteo: marcar tickets `loser`, setear `processed_at` y crear notificaciones de ganadores.
- Mejoras extra de filtros en Balance/Ventas (ya tienen rango de fechas en varias pantallas).

---

**Compatible con el despliegue actual en Render y el repositorio en GitHub.**

## Campanita + sonidos (incluido)

- **Campanita** en el header con badge de no leídas.
- Pantalla **Notificaciones** (lista, marcar leídas, tipos: ganador / anulado / sistema).
- **5 sonidos** en `public/sounds/`: ding, chime, alert, success, pop (+ silencio).
- En **Ajustes → Notificaciones** puedes elegir el sonido y activar/desactivar.
- Al procesar un sorteo se crean notificaciones de tickets ganadores (vendedor + admin/supervisor).

### Volumen de notificación del celular

| Entorno | Qué volumen usa |
|---------|-----------------|
| Navegador / WebView | Volumen de **medios** (limitación del navegador) |
| App Android nativa (Capacitor) + `@capacitor/local-notifications` | Volumen de **notificaciones** del sistema |

Para el volumen real de notificaciones en el APK:

```bash
npm install @capacitor/local-notifications
npx cap sync android
```

Copia los MP3 a `android/app/src/main/res/raw/` si quieres sonidos nativos del canal, y vuelve a compilar el APK.
