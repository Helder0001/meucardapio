-- Migração pra suportar Efí Bank como provedor de cobrança recorrente do
-- plano PRO da plataforma, ao lado do Mercado Pago (assinaturas antigas
-- continuam funcionando, identificadas por provider = 'MERCADOPAGO').

CREATE TYPE "PaymentProvider" AS ENUM ('MERCADOPAGO', 'EFI');

ALTER TABLE "Subscription" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'MERCADOPAGO';
ALTER TABLE "Subscription" ADD COLUMN "efiPlanId" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "efiSubscriptionId" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "efiChargeId" INTEGER;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_efiSubscriptionId_key" UNIQUE ("efiSubscriptionId");

CREATE TABLE "EfiPlan" (
  "id"           TEXT NOT NULL,
  "billingCycle" "BillingCycle" NOT NULL,
  "efiPlanId"    INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EfiPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EfiPlan_billingCycle_key" ON "EfiPlan"("billingCycle");
CREATE UNIQUE INDEX "EfiPlan_efiPlanId_key" ON "EfiPlan"("efiPlanId");
