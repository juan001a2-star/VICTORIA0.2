-- ============================================================
-- Consultas de Monitoreo
-- ============================================================

-- 1. Resumen general (cards superiores)
-- Parámetros: :fecha_desde, :fecha_hasta, :vendedor_id (null = todos)
SELECT 
    COUNT(DISTINCT t.id) AS total_tickets,
    COALESCE(SUM(tj.monto), 0) AS total_vendido,
    COALESCE(SUM(t.premio_total), 0) AS total_premios
FROM tickets t
JOIN ticket_jugadas tj ON tj.ticket_id = t.id
WHERE t.estado != 'anulado'
  AND t.fecha_venta::date BETWEEN :fecha_desde AND :fecha_hasta
  AND (:vendedor_id IS NULL OR t.vendedor_id = :vendedor_id);


-- 2. Totales por tipo de jugada (lista principal)
SELECT 
    tj.tipo_jugada,
    COUNT(*) AS cantidad,
    SUM(tj.monto) AS monto_total
FROM tickets t
JOIN ticket_jugadas tj ON tj.ticket_id = t.id
WHERE t.estado != 'anulado'
  AND t.fecha_venta::date BETWEEN :fecha_desde AND :fecha_hasta
  AND (:vendedor_id IS NULL OR t.vendedor_id = :vendedor_id)
GROUP BY tj.tipo_jugada
ORDER BY 
    CASE tj.tipo_jugada
        WHEN 'directo' THEN 1
        WHEN 'pale' THEN 2
        WHEN 'tripleta' THEN 3
        WHEN 'tres_cifras' THEN 4
        WHEN 'cuatro_cifras' THEN 5
        ELSE 6
    END;


-- 3. Detalle por número / combinación (la más usada)
-- Parámetros adicionales: :tipo_jugada, :ordenar_por ('cantidad' | 'monto')
SELECT 
    tj.numeros AS combinacion,
    COUNT(*) AS cantidad,
    SUM(tj.monto) AS monto_total
FROM tickets t
JOIN ticket_jugadas tj ON tj.ticket_id = t.id
WHERE t.estado != 'anulado'
  AND t.fecha_venta::date BETWEEN :fecha_desde AND :fecha_hasta
  AND tj.tipo_jugada = :tipo_jugada
  AND (:vendedor_id IS NULL OR t.vendedor_id = :vendedor_id)
GROUP BY tj.numeros
ORDER BY 
    CASE 
        WHEN :ordenar_por = 'monto' THEN SUM(tj.monto)
        ELSE COUNT(*)
    END DESC,
    tj.numeros ASC;


-- 4. Detalle con búsqueda (opcional)
-- Parámetro extra: :busqueda (ej: '23')
SELECT 
    tj.numeros AS combinacion,
    COUNT(*) AS cantidad,
    SUM(tj.monto) AS monto_total
FROM tickets t
JOIN ticket_jugadas tj ON tj.ticket_id = t.id
WHERE t.estado != 'anulado'
  AND t.fecha_venta::date BETWEEN :fecha_desde AND :fecha_hasta
  AND tj.tipo_jugada = :tipo_jugada
  AND (:vendedor_id IS NULL OR t.vendedor_id = :vendedor_id)
  AND (:busqueda IS NULL OR tj.numeros LIKE '%' || :busqueda || '%')
GROUP BY tj.numeros
ORDER BY 
    CASE 
        WHEN :ordenar_por = 'monto' THEN SUM(tj.monto)
        ELSE COUNT(*)
    END DESC;
