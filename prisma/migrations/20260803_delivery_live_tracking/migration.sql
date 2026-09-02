-- Rastreamento ao vivo do entregador no mapa (mapa de "percurso ao vivo").
-- Execute este arquivo inteiro de uma vez no SQL Editor do Neon.

-- ── Coordenadas do estabelecimento (ponto de partida no mapa) ─────────
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "latitude"  DOUBLE PRECISION;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- ── Pedido: quem está entregando + posição atual + destino geocodificado ─
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "courierId"        TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "courierLat"       DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "courierLng"       DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "courierUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryLat"      DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryLng"      DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "Order_courierId_idx" ON "Order"("courierId");

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_courierId_fkey"
    FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
