// lib/efi/plans.ts
//
// A Efí exige um "plano de assinatura" (nome + intervalo em meses +
// repetições) criado previamente antes de vincular qualquer assinatura a
// ele. Como só temos 2 ciclos possíveis (mensal/anual), criamos cada plano
// uma única vez (na primeira assinatura daquele ciclo) e guardamos o
// efiPlanId na tabela EfiPlan pra reaproveitar depois — igual o
// mercadoPagoSubId era por-tenant, aqui o plan_id é compartilhado entre
// todos os tenants do mesmo ciclo.
//
// IMPORTANTE: sandbox e produção são contas/bancos de dados DIFERENTES na
// Efí — um plan_id criado em homologação não existe (e não deve ser usado)
// em produção, e vice-versa. Por isso o cache abaixo é OBRIGATORIAMENTE
// particionado por ambiente (isSandboxEnv), não só por billingCycle. Sem
// isso, trocar EFI_SANDBOX de true->false faz o código reusar sem querer
// um plan_id de sandbox contra a API de produção, e a Efí rejeita (o plano
// simplesmente não existe do lado de lá) — erro sem log nenhum do lado de
// dentro do efiRequest de criação de plano, porque essa chamada nem chega
// a ser feita.

import { prisma } from '@/lib/db/client'
import { efiRequest } from './client'
import type { PlanTier } from '@/lib/billing/pricing'

const isSandboxEnv = process.env.EFI_SANDBOX !== 'false'

// CORREÇÃO: antes só existia o plano PRO, então os nomes eram fixos. Com
// dois tiers (Normal/Pro), cada combinação de plano+ciclo é um "plano" na
// Efí — 4 no total (Normal Mensal/Anual, Pro Mensal/Anual).
const PLAN_NAMES: Record<PlanTier, Record<'MONTHLY' | 'ANNUAL', string>> = {
  NORMAL: {
    MONTHLY: 'Meu Cardápio Normal — Mensal',
    ANNUAL:  'Meu Cardápio Normal — Anual',
  },
  PRO: {
    MONTHLY: 'Meu Cardápio Pro — Mensal',
    ANNUAL:  'Meu Cardápio Pro — Anual',
  },
}

const PLAN_INTERVAL_MONTHS: Record<'MONTHLY' | 'ANNUAL', number> = {
  MONTHLY: 1,
  ANNUAL: 12,
}

export async function getOrCreateEfiPlanId(plan: PlanTier, billingCycle: 'MONTHLY' | 'ANNUAL'): Promise<number> {
  const environment = isSandboxEnv ? 'SANDBOX' : 'PRODUCTION'

  const existing = await prisma.efiPlan.findUnique({
    where: { plan_billingCycle_environment: { plan, billingCycle, environment } },
  })
  if (existing) return existing.efiPlanId

  const response = await efiRequest<{ data: { plan_id: number } }>('POST', '/v1/plan', {
    name: PLAN_NAMES[plan][billingCycle],
    interval: PLAN_INTERVAL_MONTHS[billingCycle],
    repeats: null, // cobra indefinidamente até cancelar (não é um plano de N parcelas)
  })

  const efiPlanId = response.data.plan_id

  // upsert pra evitar corrida (duas requisições simultâneas criando o
  // mesmo plano na primeira vez que o sistema roda) criando um registro
  // duplicado localmente — a Efí em si não deduplica planos por nome.
  const saved = await prisma.efiPlan.upsert({
    where: { plan_billingCycle_environment: { plan, billingCycle, environment } },
    update: {},
    create: { plan, billingCycle, environment, efiPlanId },
  })

  return saved.efiPlanId
}
