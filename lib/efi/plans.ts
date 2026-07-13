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

const isSandboxEnv = process.env.EFI_SANDBOX !== 'false'

const PLAN_NAMES: Record<'MONTHLY' | 'ANNUAL', string> = {
  MONTHLY: 'Meu Cardápio PRO — Mensal',
  ANNUAL: 'Meu Cardápio PRO — Anual',
}

const PLAN_INTERVAL_MONTHS: Record<'MONTHLY' | 'ANNUAL', number> = {
  MONTHLY: 1,
  ANNUAL: 12,
}

export async function getOrCreateEfiPlanId(billingCycle: 'MONTHLY' | 'ANNUAL'): Promise<number> {
  const environment = isSandboxEnv ? 'SANDBOX' : 'PRODUCTION'

  const existing = await prisma.efiPlan.findUnique({
    where: { billingCycle_environment: { billingCycle, environment } },
  })
  if (existing) return existing.efiPlanId

  const response = await efiRequest<{ data: { plan_id: number } }>('POST', '/v1/plan', {
    name: PLAN_NAMES[billingCycle],
    interval: PLAN_INTERVAL_MONTHS[billingCycle],
    repeats: null, // cobra indefinidamente até cancelar (não é um plano de N parcelas)
  })

  const efiPlanId = response.data.plan_id

  // upsert pra evitar corrida (duas requisições simultâneas criando o
  // mesmo plano na primeira vez que o sistema roda) criando um registro
  // duplicado localmente — a Efí em si não deduplica planos por nome.
  const saved = await prisma.efiPlan.upsert({
    where: { billingCycle_environment: { billingCycle, environment } },
    update: {},
    create: { billingCycle, environment, efiPlanId },
  })

  return saved.efiPlanId
}
