// app/api/webhooks/mercadopago/route.ts
// VERSÃO SEGURA — VULN-03 corrigido
//
// CORREÇÃO VULN-03: Removido completamente o bypass de validação em desenvolvimento.
// O webhook SEMPRE valida a assinatura, independente do NODE_ENV.
// Para desenvolvimento: usar ngrok para receber webhooks reais do MP sandbox.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import crypto from 'crypto'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body      = await request.text()
    const signature = request.headers.get('x-signature')
    const requestId = request.headers.get('x-request-id')

    // VULN-03 CORRIGIDO: sem bypass — SEMPRE valida a assinatura
    if (!validateSignature(body, signature, requestId)) {
      console.warn('[webhook/mp] Assinatura inválida rejeitada')
      // Retornar 401 sem revelar detalhes do erro
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const event = JSON.parse(body)

    // Roteamento por tipo de evento
    if (event.type === 'subscription_preapproval') {
      await handleSubscriptionWebhook(event)
      return NextResponse.json({ ok: true })
    }

    // Ignorar eventos que não são de pagamento
    if (event.type !== 'payment' || !event.data?.id) {
      return NextResponse.json({ ok: true })
    }

    const mercadoPagoId = String(event.data.id)

    // Buscar pagamento no banco
    const payment = await prisma.payment.findFirst({
      where: { mercadoPagoId },
      include: {
        order: {
          select: {
            id: true, tenantId: true, orderNumber: true,
            status: true, customerId: true, total: true,
          },
        },
      },
    })

    if (!payment) {
      // Pode ser pagamento de assinatura — ignorar silenciosamente
      return NextResponse.json({ ok: true })
    }

    // Verificar status atual na API do MP (não confiar apenas no payload)
    const mpPayment = await fetchPaymentFromMP(mercadoPagoId, payment.order.tenantId)
    if (!mpPayment) {
      return NextResponse.json({ error: 'Could not verify payment' }, { status: 500 })
    }

    const mpStatus = mpPayment.status

    // Processar apenas transições válidas (idempotência)
    if (mpStatus === 'approved' && payment.status !== 'PAID') {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            mercadoPagoStatus: mpStatus,
            paidAt: new Date(),
            webhookData: mpPayment as any,
          },
        })

        await tx.order.update({
          where: { id: payment.order.id },
          data: { paymentStatus: 'PAID', status: 'CONFIRMED', confirmedAt: new Date() },
        })

        await tx.orderStatusHistory.create({
          data: {
            orderId: payment.order.id,
            status:  'CONFIRMED',
            notes:   'Pagamento PIX confirmado automaticamente',
          },
        })

        if (payment.order.customerId) {
          await applyCashback(tx, payment.order.tenantId, payment.order.customerId, payment.order.id, Number(payment.order.total))
          await applyLoyaltyPoints(tx, payment.order.tenantId, payment.order.customerId, payment.order.id, Number(payment.order.total))
        }
      })

      await publishOrderEvent(payment.order.tenantId, {
        type: 'ORDER_UPDATED',
        orderId: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      })

      await auditLog({
        tenantId:   payment.order.tenantId,
        action:     AuditActions.PAYMENT_RECEIVED,
        resource:   'payments',
        resourceId: payment.id,
        newValue:   { method: 'PIX', amount: Number(payment.amount), status: 'PAID' },
      })
    }

    if (mpStatus === 'rejected' && payment.status === 'PENDING') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', mercadoPagoStatus: mpStatus, failedAt: new Date() },
      })
      await prisma.order.update({
        where: { id: payment.order.id },
        data: { paymentStatus: 'FAILED' },
      })
    }

    if (mpStatus === 'refunded') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
          mercadoPagoStatus: mpStatus,
          refundedAt: new Date(),
          refundAmount: mpPayment.transaction_amount,
        },
      })
      await prisma.order.update({
        where: { id: payment.order.id },
        data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    // VULN-12: nunca expor stacktrace
    console.error('[webhook/mp] Erro interno:', error)
    return NextResponse.json({ ok: true }) // sempre 200 para o MP não retentar
  }
}

// VULN-03 CORRIGIDO: função de validação sem bypass
function validateSignature(body: string, signature: string | null, requestId: string | null): boolean {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET

  // Se não tiver secret configurado → SEMPRE rejeitar (sem exceção para dev)
  if (!webhookSecret) {
    console.error('[webhook/mp] MERCADOPAGO_WEBHOOK_SECRET não configurado!')
    return false
  }

  if (!signature) {
    return false
  }

  try {
    const parts: Record<string, string> = {}
    signature.split(',').forEach((part) => {
      const [k, v] = part.split('=')
      if (k && v) parts[k] = v
    })

    const { ts, v1 } = parts
    if (!ts || !v1) return false

    let parsedBody: any
    try { parsedBody = JSON.parse(body) } catch { return false }

    const dataId   = parsedBody?.data?.id ?? ''
    const manifest = `id:${dataId};request-id:${requestId ?? ''};ts:${ts};`

    const hmac    = crypto.createHmac('sha256', webhookSecret)
    hmac.update(manifest)
    const computed = hmac.digest('hex')

    // Comparação timing-safe para prevenir timing attacks
    if (computed.length !== v1.length) return false
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(v1,       'hex')
    )
  } catch {
    return false
  }
}

async function fetchPaymentFromMP(mercadoPagoId: string, tenantId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true },
  })
  const settings    = tenant?.settings as any
  const accessToken = settings?.mercadoPagoAccessToken ?? process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) return null

  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${mercadoPagoId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function applyCashback(tx: any, tenantId: string, customerId: string, orderId: string, total: number) {
  const config = await tx.cashbackConfig.findFirst({ where: { tenantId, isActive: true } })
  if (!config) return
  const amount  = Math.min((total * Number(config.percentage)) / 100, config.maxCashback ? Number(config.maxCashback) : Infinity)
  if (amount <= 0) return
  const customer   = await tx.customer.findFirst({ where: { id: customerId } })
  const newBalance = Number(customer.cashbackBalance) + amount
  await tx.customer.update({ where: { id: customerId }, data: { cashbackBalance: newBalance } })
  await tx.cashbackTransaction.create({
    data: { tenantId, customerId, orderId, type: 'EARN', amount, balance: newBalance, expiresAt: new Date(Date.now() + config.validityDays * 86400000) },
  })
}

async function applyLoyaltyPoints(tx: any, tenantId: string, customerId: string, orderId: string, total: number) {
  const config = await tx.loyaltyConfig.findFirst({ where: { tenantId, isActive: true } })
  if (!config) return
  const points = Math.floor(total * Number(config.pointsPerReal))
  if (points <= 0) return
  const customer   = await tx.customer.findFirst({ where: { id: customerId } })
  const newBalance = customer.loyaltyPoints + points
  await tx.customer.update({ where: { id: customerId }, data: { loyaltyPoints: newBalance } })
  await tx.loyaltyTransaction.create({
    data: { tenantId, customerId, orderId, type: 'EARN', points, balance: newBalance },
  })
}

// ── Handler para webhooks de assinatura (preapproval) ────────────────────────
// Esse bloco é adicionado ao final do arquivo existente para tratar renovações
// e cancelamentos de planos.
//
// NOTA: Integrar ao POST handler existente adicionando o case 'subscription_preapproval'

async function handleSubscriptionWebhook(event: any) {
  const subscriptionId = String(event.data?.id)
  if (!subscriptionId) return

  // Buscar no MP
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) return

  const res = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!res.ok) return
  const sub = await res.json()

  // Encontrar o tenant pela subscription
  const { prisma: db } = await import('@/lib/db/client')
  const subscription = await db.subscription.findFirst({
    where: { mercadoPagoSubId: subscriptionId },
  })
  if (!subscription) return

  const mpStatus = sub.status as string
  // authorized → ACTIVE, paused → PAST_DUE, cancelled → CANCELLED
  const statusMap: Record<string, string> = {
    authorized: 'ACTIVE',
    paused:     'PAST_DUE',
    cancelled:  'CANCELLED',
  }
  const newStatus = statusMap[mpStatus]
  if (!newStatus) return

  await db.$transaction([
    db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: newStatus as any,
        currentPeriodEnd: sub.next_payment_date ? new Date(sub.next_payment_date) : undefined,
      },
    }),
    db.tenant.update({
      where: { id: subscription.tenantId },
      data: {
        subscriptionStatus: newStatus === 'ACTIVE' ? 'ACTIVE'
          : newStatus === 'PAST_DUE' ? 'PAST_DUE'
          : 'SUSPENDED',
      },
    }),
  ])
}
