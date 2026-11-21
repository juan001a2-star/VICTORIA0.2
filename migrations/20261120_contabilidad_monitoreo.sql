-- Banca Victoria: Contabilidad, Monitoreo, Tickets y Notificaciones
-- Adaptación a la estructura real de la aplicación (lottery_users / tickets / plays).
-- Es idempotente. El arranque de Render también sincroniza el esquema con Drizzle.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS annul_reason TEXT;

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES lottery_users(id) ON DELETE CASCADE,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP,
  extra JSONB
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(created_at DESC);
