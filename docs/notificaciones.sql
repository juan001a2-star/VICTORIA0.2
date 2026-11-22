-- ============================================================
-- Consultas de Notificaciones
-- ============================================================

-- 1. Contar notificaciones no leídas (para el badge)
SELECT COUNT(*) AS no_leidas
FROM notificaciones
WHERE usuario_id = :usuario_id
  AND leida = FALSE;


-- 2. Listar notificaciones del usuario
SELECT 
    n.id,
    n.tipo,
    n.titulo,
    n.mensaje,
    n.leida,
    n.fecha_creacion,
    n.ticket_id,
    n.data_extra,
    t.numero_ticket
FROM notificaciones n
LEFT JOIN tickets t ON t.id = n.ticket_id
WHERE n.usuario_id = :usuario_id
ORDER BY n.fecha_creacion DESC
LIMIT 50;


-- 3. Marcar una notificación como leída
UPDATE notificaciones
SET 
    leida = TRUE,
    fecha_lectura = NOW()
WHERE id = :notificacion_id
  AND usuario_id = :usuario_id;


-- 4. Marcar todas como leídas
UPDATE notificaciones
SET 
    leida = TRUE,
    fecha_lectura = NOW()
WHERE usuario_id = :usuario_id
  AND leida = FALSE;


-- 5. Generar notificaciones de tickets ganadores (después de procesar sorteo)
-- Notificación al vendedor
INSERT INTO notificaciones (usuario_id, ticket_id, tipo, titulo, mensaje, data_extra)
SELECT 
    t.vendedor_id,
    t.id,
    'ticket_ganador',
    'Ticket ganador #' || t.numero_ticket,
    'Premio: $' || t.premio_total,
    jsonb_build_object(
        'premio', t.premio_total,
        'vendedor', u.codigo,
        'numero_ticket', t.numero_ticket
    )
FROM tickets t
JOIN usuarios u ON u.id = t.vendedor_id
WHERE t.estado = 'ganador'
  AND t.fecha_procesamiento::date = CURRENT_DATE;


-- Notificación a supervisores y administradores
INSERT INTO notificaciones (usuario_id, ticket_id, tipo, titulo, mensaje, data_extra)
SELECT 
    u.id,
    t.id,
    'ticket_ganador',
    'Ticket ganador #' || t.numero_ticket,
    'Premio: $' || t.premio_total || ' – Vendedor: ' || v.codigo,
    jsonb_build_object(
        'premio', t.premio_total,
        'vendedor', v.codigo,
        'numero_ticket', t.numero_ticket
    )
FROM tickets t
JOIN usuarios v ON v.id = t.vendedor_id
CROSS JOIN usuarios u
WHERE t.estado = 'ganador'
  AND t.fecha_procesamiento::date = CURRENT_DATE
  AND u.rol IN ('supervisor', 'administrador');
