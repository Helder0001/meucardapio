-- Certificado .p12 (mTLS) e chave Pix pra API Pix da Efí, separada da API
-- de Cobranças (cartão) que o EfiConnection já usava.

ALTER TABLE "EfiConnection" ADD COLUMN "pixCertificateEnc" TEXT;
ALTER TABLE "EfiConnection" ADD COLUMN "pixCertificatePassphraseEnc" TEXT;
ALTER TABLE "EfiConnection" ADD COLUMN "pixKey" TEXT;

-- Campos genéricos de provedor no Payment, preparando pro roteamento
-- Stripe/Efí (ainda usam MERCADOPAGO como default, sem mudar nada do
-- comportamento atual).
ALTER TABLE "Payment" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'MERCADOPAGO';
ALTER TABLE "Payment" ADD COLUMN "providerReference" TEXT;
CREATE INDEX "Payment_providerReference_idx" ON "Payment"("providerReference");
