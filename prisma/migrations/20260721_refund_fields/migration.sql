-- Suporte a estorno de pagamento (Pix e cartão via Efi, começando por ela).
ALTER TABLE "Payment" ADD COLUMN "pixEndToEndId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "refundedByUserId" TEXT;
