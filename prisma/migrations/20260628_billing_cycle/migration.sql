-- Migration: plano único PRO + ciclo de cobrança mensal/anual
-- Execute via: npx prisma db execute --file prisma/migrations/20260628_billing_cycle/migration.sql

-- 1. Criar enum BillingCycle
DO $$ BEGIN
  CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Adicionar coluna billingCycle na tabela Subscription (default MONTHLY)
ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';

-- 3. Adicionar valor PRO ao enum Plan (se não existir)
DO $$ BEGIN
  ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'PRO';
EXCEPTION WHEN others THEN NULL;
END $$;

-- 4. Migrar tenants existentes: STARTER e PREMIUM → PRO
UPDATE "Tenant" SET "plan" = 'PRO' WHERE "plan" IN ('STARTER', 'PREMIUM');
UPDATE "Subscription" SET "plan" = 'PRO' WHERE "plan" IN ('STARTER', 'PREMIUM');

-- ATENÇÃO: após confirmar que a migration rodou corretamente em produção,
-- execute os passos abaixo para remover os valores antigos do enum Plan.
-- Isso requer recriar o enum (PostgreSQL não suporta DROP VALUE em enums):
--
-- CREATE TYPE "Plan_new" AS ENUM ('PRO');
-- ALTER TABLE "Tenant" ALTER COLUMN "plan" TYPE "Plan_new" USING "plan"::text::"Plan_new";
-- ALTER TABLE "Subscription" ALTER COLUMN "plan" TYPE "Plan_new" USING "plan"::text::"Plan_new";
-- DROP TYPE "Plan";
-- ALTER TYPE "Plan_new" RENAME TO "Plan";
