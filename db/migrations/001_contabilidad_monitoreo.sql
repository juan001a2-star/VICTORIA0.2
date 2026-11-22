-- ============================================================
-- Migración: Contabilidad, Monitoreo, Tickets y Notificaciones
-- Adaptada al schema actual de Banca Victoria (inglés)
-- Fecha: 20 de noviembre 2026
-- ============================================================
-- Ejecutar en PostgreSQL (Render / local) ANTES o junto al redeploy.
-- Es idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- --------------------------------------------
-- 1. Modificaciones a la tabla tickets
-- --------------------------------------------
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS annul_reason TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;

-- status ya existe: active | cancelled | winner | paid  (+ se puede usar loser)
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_user_fecha ON tickets(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status_fecha ON tickets(status, created_at);

-- --------------------------------------------
-- 2. Columnas extra en plays (jugadas)
-- --------------------------------------------
ALTER TABLE plays
  ADD COLUMN IF NOT EXISTS is_winner BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prize NUMERIC(12,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_plays_ticket ON plays(ticket_id);
CREATE INDEX IF NOT EXISTS idx_plays_type ON plays(play_type);
CREATE INDEX IF NOT EXISTS idx_plays_number ON plays(number);

-- --------------------------------------------
-- 3. Tabla notifications
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id              SERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES lottery_users(id) ON DELETE CASCADE,
    ticket_id       BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
    type            VARCHAR(30) NOT NULL,  -- ticket_ganador | ticket_anulado | sistema
    title           VARCHAR(150) NOT NULL,
    message         TEXT NOT NULL,
    read            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMP,
    data_extra      TEXT
);

CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notif_fecha ON notifications(created_at DESC);

-- --------------------------------------------
-- 4. Comentarios
-- --------------------------------------------
COMMENT ON COLUMN tickets.annul_reason IS 'Motivo obligatorio al anular el ticket';
COMMENT ON COLUMN tickets.processed_at IS 'Fecha en que se procesó el sorteo (ganador/perdedor)';
COMMENT ON COLUMN plays.is_winner IS 'Si la jugada resultó ganadora tras el sorteo';
COMMENT ON COLUMN plays.prize IS 'Premio calculado de esta jugada';
COMMENT ON TABLE notifications IS 'Notificaciones de tickets ganadores, anulados y sistema';
