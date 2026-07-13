-- Corrige o cache de plan_id da Efí pra ser particionado por ambiente
-- (sandbox vs produção são contas/bancos diferentes na Efí — um plan_id de
-- um não existe no outro). Sem isso, trocar EFI_SANDBOX de true->false faz
-- o código reusar sem querer um plan_id de sandbox contra a API de
-- produção, e a Efí rejeita silenciosamente (o plano não existe lá).

CREATE TYPE "EfiEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

ALTER TABLE "EfiPlan" ADD COLUMN "environment" "EfiEnvironment";

-- Qualquer linha existente foi criada ANTES desse fix, quando o cache não
-- distinguia ambiente — na prática, os testes até agora rodaram em
-- sandbox (server EFI_SANDBOX ainda não era 'false' quando o primeiro
-- plano foi criado), então marcamos como SANDBOX pra não quebrar nada que
-- já estava funcionando em homologação.
UPDATE "EfiPlan" SET "environment" = 'SANDBOX' WHERE "environment" IS NULL;

ALTER TABLE "EfiPlan" ALTER COLUMN "environment" SET NOT NULL;

ALTER TABLE "EfiPlan" DROP CONSTRAINT IF EXISTS "EfiPlan_billingCycle_key";
ALTER TABLE "EfiPlan" DROP CONSTRAINT IF EXISTS "EfiPlan_efiPlanId_key";
DROP INDEX IF EXISTS "EfiPlan_billingCycle_key";
DROP INDEX IF EXISTS "EfiPlan_efiPlanId_key";

CREATE UNIQUE INDEX "EfiPlan_billingCycle_environment_key" ON "EfiPlan"("billingCycle", "environment");
CREATE UNIQUE INDEX "EfiPlan_efiPlanId_environment_key" ON "EfiPlan"("efiPlanId", "environment");
