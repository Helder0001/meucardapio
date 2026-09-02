-- Migration: integração com o Asaas como mais uma forma de pagamento dos
-- tenants (Pix e cartão no cardápio digital), ao lado de Mercado Pago,
-- Stripe e Efí.
--
-- Diferente do Mercado Pago/Stripe, o Asaas NÃO usa OAuth — cada lojista
-- cola a própria API Key (gerada no painel dele, em Integrações → Chaves
-- de API). Por isso a tabela guarda só a API Key criptografada, sem
-- client_id/secret/scope.
--
-- Execute via: npx prisma db execute --file prisma/migrations/20260719_asaas_connection/migration.sql
-- Depois: npx prisma generate

ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'ASAAS';

CREATE TABLE "AsaasConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "asaasAccountId" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "webhookTokenEnc" TEXT,
    "webhookId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsaasConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AsaasConnection_tenantId_key" ON "AsaasConnection"("tenantId");
CREATE INDEX "AsaasConnection_tenantId_idx" ON "AsaasConnection"("tenantId");

ALTER TABLE "AsaasConnection" ADD CONSTRAINT "AsaasConnection_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
