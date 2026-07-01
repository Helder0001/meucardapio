-- Migration: adiciona 'CREDIT_CARD_MANUAL' ao enum PaymentMethod.
--
-- Diferencia o crédito pago ONLINE no cardápio (CREDIT_CARD — cobrado na hora
-- via Mercado Pago Bricks, confirmação automática) do crédito pago MANUALMENTE
-- na entrega/retirada (CREDIT_CARD_MANUAL — na maquininha do entregador/balcão,
-- confirmado depois pelo lojista, igual ao DEBIT_CARD e CASH já funcionam hoje).
--
-- Execute via: npx prisma db execute --file prisma/migrations/20260630_credit_card_manual/migration.sql
-- Depois: npx prisma generate

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CREDIT_CARD_MANUAL';
