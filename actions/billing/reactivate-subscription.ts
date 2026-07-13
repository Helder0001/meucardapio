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

const PLAN_PRICE_MONTHLY = 1.00
const PLAN_PRICE_ANNUAL = parseFloat((PLAN_PRICE_MONTHLY * 12 * 0.9).toFixed(2))

export type ReactivateResult = { error?: string; status?: string }

export interface ReactivateCardInput {
  cardToken: string // payment_token da Efí (Efí.js), não mais card_token_id do MP
  payerEmail: string
  payerCpf: string
  payerPhone: string // Efí retorna 500 "required_property" (/payment/credit_card/customer) sem isso
  cardholderName: string
  billingCycle?: 'MONTHLY' | 'ANNUAL'
}

export async function reactivateSubscriptionAction(
  input: ReactivateCardInput
): Promise<ReactivateResult> {
  const session = await auth()
  if (!session?.user?.tenantId || session.user.role === 'MASTER_ADMIN') {
    return { error: 'Sessão inválida.' }
  }

  const { cardToken, payerEmail, payerCpf, payerPhone, cardholderName } = input
  const billingCycle = input.billingCycle ?? 'MONTHLY'

  if (!cardToken || !payerEmail || !payerCpf || !payerPhone) {
    return { error: 'Dados do cartão incompletos.' }
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

  // DEBUG TEMPORÁRIO — confirmar se EFI_CLIENT_ID/SECRET estão de fato
  // configurados neste ambiente antes de decidir se chama a Efí ou não.
  console.log('[reactivate-subscription][debug] credenciais Efi presentes?', {
    hasClientId: !!process.env.EFI_CLIENT_ID,
    hasClientSecret: !!process.env.EFI_CLIENT_SECRET,
    sandbox: process.env.EFI_SANDBOX,
  })

  if (!process.env.EFI_CLIENT_ID || !process.env.EFI_CLIENT_SECRET) {
    console.error('[reactivate-subscription] EFI_CLIENT_ID/SECRET ausentes — abortando antes de chamar a Efi')
    return { error: 'Pagamento não configurado no servidor. Contate o suporte.' }
  }

  const isAnnual = billingCycle === 'ANNUAL'
  const amount = isAnnual ? PLAN_PRICE_ANNUAL : PLAN_PRICE_MONTHLY

  let efiResult: Awaited<ReturnType<typeof createEfiCardSubscription>>
  try {
    efiResult = await createEfiCardSubscription({
      billingCycle,
      amount,
      planLabel: `Meu Cardápio — Reativação Plano PRO ${isAnnual ? 'Anual' : 'Mensal'} — ${tenant.name}`,
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
  const periodEnd = new Date(
    now.getTime() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000
  )

  // Mesma cautela de antes: NÃO marcar ACTIVE otimista. O charge da Efí
  // nasce com status 'waiting' (aguardando confirmação do banco emissor do
  // cartão) — só o webhook (app/api/webhooks/efi/route.ts), ao receber a
  // confirmação 'paid' da cobrança, vira o status pra ACTIVE de verdade.
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {
      provider: 'EFI',
      efiPlanId: efiResult.efiPlanId,
      efiSubscriptionId: efiResult.efiSubscriptionId,
      efiChargeId: efiResult.efiChargeId,
      mercadoPagoSubId: null,
      billingCycle: billingCycle as any,
      amount,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelledAt: null,
      cancelReason: null,
    },
    create: {
      tenantId: tenant.id,
      plan: 'PRO',
      provider: 'EFI',
      billingCycle: billingCycle as any,
      status: 'PAST_DUE',
      efiPlanId: efiResult.efiPlanId,
      efiSubscriptionId: efiResult.efiSubscriptionId,
      efiChargeId: efiResult.efiChargeId,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      amount,
    },
  })

  return { status: 'pending_confirmation' }
}
