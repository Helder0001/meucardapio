-- Migration: adiciona campos de Checkout Pro (link de pagamento) e cartão
-- ao modelo Payment.
-- Execute via: npx prisma db execute --file prisma/migrations/20260629_payment_card_fields/migration.sql
-- Depois: npx prisma generate

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "preferenceId"  TEXT,
  ADD COLUMN IF NOT EXISTS "checkoutUrl"   TEXT,
  ADD COLUMN IF NOT EXISTS "cardBrand"     TEXT;
