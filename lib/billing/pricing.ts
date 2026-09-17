// lib/billing/pricing.ts
//
// Fonte única dos preços dos planos — TUDO que precisa mostrar ou cobrar
// um valor (landing page, tela de assinatura, registro, criação do plano
// na Efí) importa daqui, em vez de ter o número escrito em vários lugares
// (o jeito antigo, que é como uma mudança de preço acaba esquecendo de
// atualizar um dos lugares).
//
// Plano NORMAL (R$ 39,90/mês): tudo, EXCETO os recursos de WhatsApp
// automático (confirmação de pedido, status, cobrança — ver
// hasWhatsAppAccess abaixo).
// Plano PRO (R$ 59,90/mês): tudo, incluindo WhatsApp.
// Anual: 15% de desconto sobre o valor mensal × 12, nos dois planos.
//
// O trial de 7 dias é sempre no plano NORMAL — ver
// prisma/schema.prisma (Tenant.plan @default(NORMAL)) e
// actions/auth/register.ts.

export type PlanTier = 'NORMAL' | 'PRO'
export type BillingCycle = 'MONTHLY' | 'ANNUAL'

const MONTHLY_PRICE: Record<PlanTier, number> = {
  NORMAL: 39.90,
  PRO:    59.90,
}

const ANNUAL_DISCOUNT = 0.15 // 15% de desconto no anual, nos dois planos

export const PLAN_LABEL: Record<PlanTier, string> = {
  NORMAL: 'Normal',
  PRO:    'Pro',
}

// Preço mensal "cheio" (sem desconto), pra exibir riscado ao lado do anual.
export function monthlyPrice(plan: PlanTier): number {
  return MONTHLY_PRICE[plan]
}

// Valor total cobrado de uma vez no ciclo anual (com os 15% já aplicados).
export function annualTotalPrice(plan: PlanTier): number {
  return round2(MONTHLY_PRICE[plan] * 12 * (1 - ANNUAL_DISCOUNT))
}

// Equivalente mensal do plano anual — só pra exibição ("sai por R$X/mês"),
// nunca usado como valor de cobrança real (a cobrança anual é sempre o
// valor cheio de annualTotalPrice, uma vez por ano).
export function annualMonthlyEquivalent(plan: PlanTier): number {
  return round2(annualTotalPrice(plan) / 12)
}

// Valor que efetivamente é cobrado do cliente nesse ciclo/plano — usado
// tanto na tela de assinatura quanto na criação da cobrança na Efí.
export function chargeAmount(plan: PlanTier, cycle: BillingCycle): number {
  return cycle === 'ANNUAL' ? annualTotalPrice(plan) : monthlyPrice(plan)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// CORREÇÃO: os recursos de WhatsApp automático (confirmação de pedido,
// status, cobrança — ver lib/messaging/evolution.ts) agora são
// exclusivos do plano PRO. Chame isso antes de disparar qualquer
// mensagem automática ou de mostrar a tela de configuração do WhatsApp.
export function hasWhatsAppAccess(tenant: { plan: PlanTier; subscriptionStatus: string }): boolean {
  if (tenant.plan !== 'PRO') return false
  // Durante o trial (sempre NORMAL) isso já barra sozinho pelo plano;
  // aqui também bloqueia se a assinatura estiver suspensa/cancelada,
  // mesmo que o campo `plan` do tenant ainda esteja como PRO no banco.
  return tenant.subscriptionStatus === 'ACTIVE' || tenant.subscriptionStatus === 'TRIAL'
}
