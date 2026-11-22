-- ============================================================
-- Consultas de Tickets
-- ============================================================

-- 1. Listado principal de Tickets (con filtros)
-- Parámetros: :fecha_desde, :fecha_hasta, :vendedor_id, :estado, :numero_ticket
SELECT 
    t.id,
    t.numero_ticket,
    t.fecha_venta,
    t.monto_total,
    t.estado,
    t.premio_total,
    u.codigo AS vendedor_codigo,
    u.nombre AS vendedor_nombre,
    b.codigo AS banca_codigo,
    t.anulado_por,
    t.fecha_anulacion,
    t.motivo_anulacion
FROM tickets t
JOIN usuarios u ON u.id = t.vendedor_id
JOIN bancas b ON b.id = t.banca_id
WHERE t.fecha_venta::date BETWEEN :fecha_desde AND :fecha_hasta
  AND (:vendedor_id IS NULL OR t.vendedor_id = :vendedor_id)
  AND (:estado IS NULL OR t.estado = :estado)
  AND (:numero_ticket IS NULL OR t.numero_ticket ILIKE '%' || :numero_ticket || '%')
ORDER BY t.fecha_venta DESC;


-- 2. Detalle completo de un ticket
SELECT 
    t.id,
    t.numero_ticket,
    t.fecha_venta,
    t.monto_total,
    t.estado,
    t.premio_total,
    t.fecha_procesamiento,
    u.codigo AS vendedor_codigo,
    u.nombre AS vendedor_nombre,
    b.codigo AS banca_codigo,
    b.nombre AS banca_nombre,
    t.fecha_anulacion,
    t.motivo_anulacion,
    ua.codigo AS anulado_por_codigo,
    ua.nombre AS anulado_por_nombre
FROM tickets t
JOIN usuarios u ON u.id = t.vendedor_id
JOIN bancas b ON b.id = t.banca_id
LEFT JOIN usuarios ua ON ua.id = t.anulado_por
WHERE t.id = :ticket_id;


-- 3. Jugadas de un ticket
SELECT 
    id,
    tipo_jugada,
    numeros,
    monto,
    premio,
    es_ganadora
FROM ticket_jugadas
WHERE ticket_id = :ticket_id
ORDER BY 
    CASE tipo_jugada
        WHEN 'directo' THEN 1
        WHEN 'pale' THEN 2
        WHEN 'tripleta' THEN 3
        WHEN 'tres_cifras' THEN 4
        WHEN 'cuatro_cifras' THEN 5
    END,
    numeros;


-- 4. Anular un ticket (requiere motivo)
UPDATE tickets
SET 
    estado = 'anulado',
    anulado_por = :usuario_id,
    fecha_anulacion = NOW(),
    motivo_anulacion = :motivo
WHERE id = :ticket_id
  AND estado = 'activo';
