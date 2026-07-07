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

import { prisma } from '@/lib/db/client'
import { auth } from '@/lib/auth/session'
import { getInternalApiSecret } from '@/lib/security/internal-secret'

const PLAN_PRICE_MONTHLY = 1.00
const PLAN_PRICE_ANNUAL = parseFloat((PLAN_PRICE_MONTHLY * 12 * 0.9).toFixed(2))

export type ReactivateResult = { error?: string; pixInitPoint?: string }

export async function reactivateSubscriptionAction(
  billingCycle: 'MONTHLY' | 'ANNUAL' = 'MONTHLY'
): Promise<ReactivateResult> {
  const session = await auth()
  if (!session?.user?.tenantId || session.user.role === 'MASTER_ADMIN') {
    return { error: 'Sessão inválida.' }
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

  const email = session.user.email ?? ''
  if (!email) return { error: 'Email da conta não encontrado.' }

  const isAnnual = billingCycle === 'ANNUAL'
  const amount = isAnnual ? PLAN_PRICE_ANNUAL : PLAN_PRICE_MONTHLY

  let mpResult: { subscriptionId?: string; pixInitPoint?: string; error?: string }
  try {
    const res = await fetch(`${appUrl}/api/mp/preapproval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': getInternalApiSecret(),
      },
      body: JSON.stringify({
        reason: `Meu Cardápio — Reativação Plano PRO ${isAnnual ? 'Anual' : 'Mensal'} — ${tenant.name}`,
        payer_email: email,
        billing_cycle: billingCycle,
        payer: {
          email,
          first_name: session.user.name?.split(' ')[0] ?? email.split('@')[0],
          last_name: session.user.name?.split(' ').slice(1).join(' ') || 'Cliente',
          identification: { type: 'CPF', number: '' },
        },
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      return { error: data.error ?? 'Erro ao processar pagamento. Tente novamente.' }
    }
    mpResult = { subscriptionId: data.subscriptionId, pixInitPoint: data.pixInitPoint }
  } catch (err) {
    console.error('[reactivate-subscription] erro ao chamar /api/mp/preapproval:', err)
    return { error: 'Erro ao conectar ao Mercado Pago. Tente novamente.' }
  }

  if (!mpResult.subscriptionId) {
    return { error: 'Não foi possível gerar a cobrança. Tente novamente.' }
  }

  const now = new Date()
  const periodEnd = new Date(
    now.getTime() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000
  )

  // Upsert: o tenant já tem uma Subscription de quando se cadastrou
  // (tenantId é @unique nessa tabela) — atualizamos com o novo
  // mercadoPagoSubId em vez de criar um registro duplicado.
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {
      mercadoPagoSubId: mpResult.subscriptionId,
      billingCycle: billingCycle as any,
      status: 'PAST_DUE',
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

  return { pixInitPoint: mpResult.pixInitPoint }
}
