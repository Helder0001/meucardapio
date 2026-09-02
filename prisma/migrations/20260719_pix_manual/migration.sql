-- Migration: adiciona suporte a "Pix manual" (chave Pix própria do
-- estabelecimento, sem gateway — confirmação manual pelo lojista após
-- receber o comprovante por WhatsApp).
--
-- 'PIX_MANUAL' -> novo método de pagamento, separado de 'PIX' (que é o Pix
-- automático via Mercado Pago/Efí, com confirmação por webhook).
-- 'MANUAL'     -> novo valor de PaymentProvider, para marcar que esse
-- pagamento não passou por nenhum gateway.
--
-- Execute via: npx prisma db execute --file prisma/migrations/20260719_pix_manual/migration.sql
-- Depois: npx prisma generate

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PIX_MANUAL';
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'MANUAL';
