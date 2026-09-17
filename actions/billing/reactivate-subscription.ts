'use server'

// actions/billing/reactivate-subscription.ts
//
// Gera uma nova assinatura na Efí Bank (API Cobranças) para um tenant cujo
// trial venceu ou que foi suspenso por falta de pagamento.
//
// MIGRAÇÃO: isso ANTES usava o Mercado Pago (preapproval). Trocado pra Efí
// Bank a pedido — só a cobrança recorrente do PRÓPRIO plano PRO da
// plataforma. Os pagamentos dos tenants pros clientes deles (PIX/cartão no
// cardápio) continuam 100% no Mercado Pago, sem nenhuma mudança.
//
// IMPORTANTE: o `cardToken` aqui é um `payment_token` gerado no browser via
// Efí.js (biblioteca JS específica da conta Efí, injetada no formulário de
// /assinatura) — não é mais o card_token_id do Card Payment Brick do MP.

import { prisma } from '@/lib/db/client'
import { auth } from '@/lib/auth/session'
import { createEfiCardSubscription } from '@/lib/efi/subscription'
import { onlyDigits } from '@/lib/utils/cpf'
import { chargeAmount, PLAN_LABEL, type PlanTier } from '@/lib/billing/pricing'

export type ReactivateResult = { error?: string; status?: string }

export interface ReactivateCardInput {
  // CORREÇÃO: quando o trial acaba e o acesso é bloqueado, o cliente
  // precisa ESCOLHER entre Normal e Pro pra renovar — antes isso não
  // existia, e a reativação sempre virava PRO (o único plano que existia).
  plan: PlanTier
  cardToken: string // payment_token da Efí (Efí.js), não mais card_token_id do MP
  payerEmail: string
  payerCpf: string
  payerPhone: string // Efí retorna 500 "required_property" (/payment/credit_card/customer) sem isso
  cardholderName: string
  cardLast4: string // 4 últimos dígitos, extraídos no navegador antes da tokenização — só pra exibir no extrato
  billingCycle?: 'MONTHLY' | 'ANNUAL'
}

export async function reactivateSubscriptionAction(
  input: ReactivateCardInput
): Promise<ReactivateResult> {
  const session = await auth()
  if (!session?.user?.tenantId || session.user.role === 'MASTER_ADMIN') {
    return { error: 'Sessão inválida.' }
  }

  const { cardToken, payerEmail, payerCpf, payerPhone, cardholderName, cardLast4 } = input
  const billingCycle = input.billingCycle ?? 'MONTHLY'
  const plan = input.plan

  if (!cardToken || !payerEmail || !payerCpf || !payerPhone) {
    return { error: 'Dados do cartão incompletos.' }
  }
  if (plan !== 'NORMAL' && plan !== 'PRO') {
    return { error: 'Selecione um plano (Normal ou Pro) para continuar.' }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { id: true, name: true },
  })
  if (!tenant) return { error: 'Estabelecimento não encontrado.' }

  // DEBUG TEMPORÁRIO — remover depois de confirmar a causa do erro
  // "Recebedor e cliente não podem ser a mesma pessoa". Só loga os 2
  // últimos dígitos, não expõe o CPF inteiro no log.
  console.log('[reactivate-subscription][debug] CPF recebido termina em:', onlyDigits(payerCpf).slice(-2))

  if (!process.env.EFI_CLIENT_ID || !process.env.EFI_CLIENT_SECRET) {
    return { error: 'Pagamento não configurado no servidor. Contate o suporte.' }
  }

  const isAnnual = billingCycle === 'ANNUAL'
  // CORREÇÃO: era um valor de teste (R$1,00) fixo — agora usa o preço real
  // do plano escolhido (Normal R$39,90 ou Pro R$59,90/mês, com 15% de
  // desconto no anual — ver lib/billing/pricing.ts).
  const amount = chargeAmount(plan, billingCycle)

  let efiResult: Awaited<ReturnType<typeof createEfiCardSubscription>>
  try {
    efiResult = await createEfiCardSubscription({
      plan,
      billingCycle,
      amount,
      planLabel: `Meu Cardápio — Reativação Plano ${PLAN_LABEL[plan]} ${isAnnual ? 'Anual' : 'Mensal'} — ${tenant.name}`,
      customerName: cardholderName,
      customerCpf: onlyDigits(payerCpf),
      customerEmail: payerEmail,
      customerPhone: onlyDigits(payerPhone),
      paymentToken: cardToken,
      // sem trial_days aqui: reativação cobra imediatamente, o período
      // grátis já foi usado no cadastro.
    })
    // DEBUG TEMPORÁRIO — remover depois de confirmar a causa do sumiço da
    // assinatura no painel da Efí.
    console.log('[reactivate-subscription][debug] SUCESSO na Efi:', JSON.stringify(efiResult))
  } catch (err) {
    console.error('[reactivate-subscription][efi] erro ao criar assinatura:', err)
    return { error: 'Pagamento não autorizado. Verifique os dados do cartão.' }
  }

  const now = new Date()
  // Usa meses/anos cheios (igual o intervalo real do plano cadastrado na
  // Efí — veja lib/efi/plans.ts, PLAN_INTERVAL_MONTHS), não dias fixos
  // (30/365), pra bater exatamente com o "próximo vencimento" que a própria
  // Efí calcula e mostra no painel dela.
  const periodEnd = new Date(now)
  if (isAnnual) {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  }

  // Mesma cautela de antes: NÃO marcar ACTIVE otimista. O charge da Efí
  // nasce com status 'waiting' (aguardando confirmação do banco emissor do
  // cartão) — só o webhook (app/api/webhooks/efi/route.ts), ao receber a
  // confirmação 'paid' da cobrança, vira o status pra ACTIVE de verdade.
  // CORREÇÃO: também precisa atualizar Tenant.plan — é esse campo que
  // decide se o WhatsApp automático fica liberado (ver
  // lib/billing/pricing.ts, hasWhatsAppAccess). Antes só a Subscription
  // guardava o plano; o Tenant ficava parado em PRO desde a criação.
  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenant.id }, data: { plan } }),
    prisma.subscription.upsert({
      where: { tenantId: tenant.id },
      update: {
        provider: 'EFI',
        plan,
        efiPlanId: efiResult.efiPlanId,
        efiSubscriptionId: efiResult.efiSubscriptionId,
        efiChargeId: efiResult.efiChargeId,
        mercadoPagoSubId: null,
        billingCycle: billingCycle as any,
        amount,
        cardLast4,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelledAt: null,
        cancelReason: null,
      },
      create: {
        tenantId: tenant.id,
        plan,
        provider: 'EFI',
        billingCycle: billingCycle as any,
        status: 'PAST_DUE',
        cardLast4,
        efiPlanId: efiResult.efiPlanId,
        efiSubscriptionId: efiResult.efiSubscriptionId,
        efiChargeId: efiResult.efiChargeId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        amount,
      },
    }),
  ])

  return { status: 'pending_confirmation' }
}
