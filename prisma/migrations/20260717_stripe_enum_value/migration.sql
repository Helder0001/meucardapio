-- O enum PaymentProvider no banco só tinha MERCADOPAGO e EFI. A migration
-- anterior (20260715_stripe_efi_tenant_connections) criou a tabela
-- StripeConnection mas esqueceu de adicionar 'STRIPE' como valor válido
-- do enum — sem isso, qualquer Payment.provider = 'STRIPE' falha em
-- runtime com "invalid input value for enum".

ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'STRIPE';
