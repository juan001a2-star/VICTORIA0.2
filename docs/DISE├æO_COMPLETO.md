# Banca – Diseño Completo: Contabilidad, Monitoreo, Tickets y Notificaciones

Fecha: 20 de noviembre 2026

---

## 1. Resumen de funcionalidades

| Módulo                         | Descripción                                                                 | Roles                  |
|--------------------------------|-----------------------------------------------------------------------------|------------------------|
| Contabilidad y Monitoreo       | Nuevo menú con seguimiento de ventas por tipo de jugada y por vendedor     | Supervisor / Admin     |
| Monitoreo                      | Totales + detalle por número/combinación (Directo, Palé, Tripleta...)      | Supervisor / Admin     |
| Tickets                        | Listado, estados, anulación con motivo obligatorio                         | Supervisor / Admin     |
| Notificaciones                 | Aviso de tickets ganadores (y anulados)                                    | Vendedor + Superv/Admin|
| Mejoras Balance y Ventas       | Filtro por vendedor + rango de fechas                                      | Supervisor / Admin     |

---

## 2. Diseño de Interfaces (UI)

### 2.1 Menú Contabilidad y Monitoreo

Nuevo ítem de menú visible **solo** para Supervisor y Administrador.

Contiene dos pestañas:
- **Monitoreo**
- **Tickets**

### 2.2 Pantalla Monitoreo

**Filtros:**
- Rango de fechas (Desde – Hasta)
- Vista: General | Por Grupo | Por Vendedor
- Selector de vendedor (cuando se elige “Por Vendedor”)
- Botón Buscar

**Resumen superior (cards):**
- Total vendido
- Total de tickets
- Total comisiones
- Total premios

**Lista por tipo de jugada:**

| Tipo de Jugada   | Cantidad | Monto total   |
|------------------|----------|---------------|
| Directo          |          |               |
| Palé             |          |               |
| Tripleta         |          |               |
| Tres Cifras      |          |               |
| Cuatro Cifras    |          |               |
| **TOTAL**        |          |               |

Al tocar un tipo se abre el **detalle**.

### 2.3 Detalle por tipo de jugada (formato estándar)

```
┌──────────────────────────────────────────┐
│  ← [Tipo] – Detalle                      │
├──────────────────────────────────────────┤
│  Ordenar por: [ Cantidad ▼ ]             │
├──────────────────────────────────────────┤
│  Combinación / Número   Cantidad   Monto │
│  ......................................  │
│  TOTAL                  XX       $XXX.XX │
└──────────────────────────────────────────┘
```

**Opciones de ordenamiento:**
- Cantidad (mayor a menor) → por defecto
- Monto (mayor a menor)
- Número / Combinación (orden numérico)

**Ejemplos:**

**Directo**
```
Número      Cantidad      Monto
12             18        $360.00
23             14        $280.00
45              9        $180.00
TOTAL Directo  53       $1,060.00
```

**Palé**
```
Combinación   Cantidad      Monto
12-45            6         $120.00
23-67            4          $80.00
12-23            3          $60.00
TOTAL Palé      16         $320.00
```

**Tripleta**
```
Combinación     Cantidad      Monto
12-45-67           5         $150.00
23-45-89           3          $90.00
TOTAL Tripleta    11         $330.00
```

**Tres Cifras / Cuatro Cifras** → mismo formato que Directo.

### 2.4 Pantalla Tickets

**Filtros:**
- Rango de fechas
- Vendedor
- Estado: Todos / Activo / Anulado / Ganador / Perdedor
- Búsqueda por número de ticket

**Lista:**
- Número de ticket
- Fecha y hora
- Vendedor
- Banca
- Monto
- Estado con color (verde/rojo/amarillo/gris)

**Detalle del ticket:**
- Toda la información
- Lista de jugadas
- Si está anulado → quién, cuándo y motivo
- Botón “Anular Ticket” (solo si está activo)
  - Modal con campo Motivo (obligatorio)

### 2.5 Sistema de Notificaciones

**Campanita en la barra superior** con badge de no leídas.

**Pantalla de Notificaciones:**
- Lista ordenada de más reciente a más antigua
- ● No leída / ○ Leída
- Tipos:
  - Ticket ganador (dorado)
  - Ticket anulado (rojo)
  - Sistema (azul)
- Botón “Marcar todas como leídas”
- Al tocar → abre el detalle del ticket

**Detalle desde notificación de ganador:**
- Premio destacado
- Datos del ticket
- Jugadas con su premio individual

---

## 3. Flujo: Procesar Sorteo → Marcar Ganadores → Notificaciones

1. Se cargan los números ganadores del sorteo.
2. Se actualizan las jugadas ganadoras en `ticket_jugadas` (`es_ganadora = true` + cálculo de `premio`).
3. Se actualiza cada ticket:
   - Si tiene al menos una jugada ganadora → `estado = 'ganador'`
   - Si no → `estado = 'perdedor'`
   - Se guarda `premio_total` y `fecha_procesamiento`.
4. Se insertan notificaciones para:
   - El vendedor del ticket
   - Todos los usuarios con rol `supervisor` o `administrador`.

---

## 4. Reglas de negocio finales

- El menú **Contabilidad y Monitoreo** solo es visible para roles `supervisor` y `administrador`.
- Los números de combinaciones (Palé y Tripleta) se guardan **siempre ordenados** (12-45, nunca 45-12).
- La anulación de un ticket **requiere motivo obligatorio**.
- Solo se pueden anular tickets en estado `activo`.
- Al procesar el sorteo se generan notificaciones automáticamente.
- El badge de la campanita muestra únicamente las notificaciones no leídas.
- En el detalle de Monitoreo se puede ordenar por Cantidad, Monto o Número.

---

## 5. Mejoras en pantallas existentes (Balance y Ventas)

Agregar en ambas pantallas:
- Selector de **Vendedor**
- Rango de fechas **Desde – Hasta** (no solo “Hoy”)

---

**Fin del documento**
