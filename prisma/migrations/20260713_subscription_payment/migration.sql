-- Adiciona cardLast4 na Subscription e cria SubscriptionPayment, o
-- historico de cobrancas confirmadas (extrato tipo fatura) exibido na
-- nova tela de assinatura (fora do perfil).

ALTER TABLE "Subscription" ADD COLUMN "cardLast4" TEXT;

CREATE TABLE "SubscriptionPayment" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "plan"           "Plan" NOT NULL,
  "billingCycle"   "BillingCycle" NOT NULL,
  "amount"         DECIMAL(10,2) NOT NULL,
  "cardLast4"      TEXT,
  "efiChargeId"    INTEGER,
  "paidAt"         TIMESTAMP(3) NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPayment_efiChargeId_key" ON "SubscriptionPayment"("efiChargeId");
CREATE INDEX "SubscriptionPayment_tenantId_idx" ON "SubscriptionPayment"("tenantId");

ALTER TABLE "SubscriptionPayment"
  ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
