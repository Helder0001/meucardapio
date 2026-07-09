'use server'

// actions/billing/reactivate-subscription.ts
//
// Gera um novo preapproval (assinatura) no Mercado Pago para um tenant cujo
// trial venceu ou que foi suspenso por falta de pagamento. Reaproveita
// exatamente o mesmo mecanismo já usado em actions/auth/register.ts —
// /api/mp/preapproval, com as credenciais da PLATAFORMA — em vez de criar um
// fluxo de cobrança paralelo. Quando o pagamento for confirmado, o webhook
// (handleSubscriptionWebhook em app/api/webhooks/mercadopago/route.ts) já
// sabe atualizar subscriptionStatus do tenant para ACTIVE.
//
// IMPORTANTE: assinatura (preapproval) no Mercado Pago só existe com
// cartão — PIX não tem cobrança recorrente automática nessa API (isso é
// "Pix Automático", um produto diferente, não integrado aqui). Por isso
// esta action exige um card_token_id já tokenizado no browser via Card
// Payment Brick (components/... "cardPayment"), nunca dado de cartão cru.

import { prisma } from '@/lib/db/client'
import { auth } from '@/lib/auth/session'
import { getInternalApiSecret } from '@/lib/security/internal-secret'

const PLAN_PRICE_MONTHLY = 1.00
const PLAN_PRICE_ANNUAL = parseFloat((PLAN_PRICE_MONTHLY * 12 * 0.9).toFixed(2))

export type ReactivateResult = { error?: string; status?: string }

export interface ReactivateCardInput {
  cardToken: string
  payerEmail: string
  payerCpf: string
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

  const { cardToken, payerEmail, payerCpf, cardholderName } = input
  const billingCycle = input.billingCycle ?? 'MONTHLY'

  if (!cardToken || !payerEmail || !payerCpf) {
    return { error: 'Dados do cartão incompletos.' }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { id: true, name: true },
  })
  if (!tenant) return { error: 'Estabelecimento não encontrado.' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return { error: 'Configuração do servidor inválida.' }
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    return { error: 'Pagamento não configurado no servidor. Contate o suporte.' }
  }

  const isAnnual = billingCycle === 'ANNUAL'
  const amount = isAnnual ? PLAN_PRICE_ANNUAL : PLAN_PRICE_MONTHLY

  const nameParts = cardholderName.trim().split(/\s+/)
  const firstName = nameParts[0] || payerEmail.split('@')[0]
  const lastName = nameParts.slice(1).join(' ') || 'Cliente'

  let mpResult: { subscriptionId?: string; error?: string }
  try {
    const res = await fetch(`${appUrl}/api/mp/preapproval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': getInternalApiSecret(),
      },
      body: JSON.stringify({
        reason: `Meu Cardápio — Reativação Plano PRO ${isAnnual ? 'Anual' : 'Mensal'} — ${tenant.name}`,
        payer_email: payerEmail,
        billing_cycle: billingCycle,
        card_token_id: cardToken,
        start_immediately: true,
        payer: {
          email: payerEmail,
          first_name: firstName,
          last_name: lastName,
          identification: { type: payerCpf.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF', number: payerCpf.replace(/\D/g, '') },
        },
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      return { error: data.error ?? 'Pagamento não autorizado. Verifique os dados do cartão.' }
    }
    mpResult = { subscriptionId: data.subscriptionId }
  } catch (err) {
    console.error('[reactivate-subscription] erro ao chamar /api/mp/preapproval:', err)
    return { error: 'Erro ao conectar ao Mercado Pago. Tente novamente.' }
  }

  if (!mpResult.subscriptionId) {
    return { error: 'Não foi possível ativar a assinatura. Tente novamente.' }
  }

  const now = new Date()
  const periodEnd = new Date(
    now.getTime() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000
  )

  // CORREÇÃO: status ACTIVE aqui era otimista, baseado só no preapproval
  // vir "authorized" — mas "authorized" no /preapproval só confirma que o
  // MANDATO (cartão validado) foi criado, não que a PRIMEIRA COBRANÇA em si
  // foi aprovada. O MP tenta cobrar de forma assíncrona logo em seguida, e
  // essa cobrança pode ser recusada (cartão sem limite, antifraude etc.) —
  // nesse caso o preapproval continua "authorized" (MP vai tentar cobrar de
  // novo depois), só que sem ter recebido nada ainda. Marcar ACTIVE aqui
  // liberava o acesso do estabelecimento mesmo com a cobrança recusada.
  // Agora: salvamos o mercadoPagoSubId mas mantemos o status atual do
  // tenant (SUSPENDED/PAST_DUE) intocado — só o webhook de pagamento
  // (handleSubscriptionPaymentEvent, evento 'payment' ou
  // 'subscription_authorized_payment') vira pra ACTIVE quando a cobrança
  // for realmente aprovada.
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {
      mercadoPagoSubId: mpResult.subscriptionId,
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
      billingCycle: billingCycle as any,
      status: 'PAST_DUE',
      mercadoPagoSubId: mpResult.subscriptionId,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      amount,
    },
  })

  return { status: 'pending_confirmation' }
}
