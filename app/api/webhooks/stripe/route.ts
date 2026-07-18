// app/api/webhooks/stripe/route.ts
//
// Recebe eventos do Stripe (Checkout Session paga) pra confirmar
// pagamentos dos pedidos dos tenants.
//
// IMPORTANTE — configuração única necessária no painel do Stripe (não dá
// pra fazer via API por tenant, é uma configuração da PLATAFORMA inteira):
// Stripe Dashboard → Developers → Webhooks → Add endpoint →
//   URL: https://SEU_DOMINIO/api/webhooks/stripe
//   Marcar "Listen to events on Connected accounts" (crucial — sem isso,
//   só recebe eventos da conta da plataforma, não das contas dos tenants)
//   Evento: checkout.session.completed
// Copiar o "Signing secret" gerado pra STRIPE_WEBHOOK_SECRET.
//
// Verificação de assinatura feita manualmente (sem SDK), seguindo o
// esquema documentado: https://docs.stripe.com/webhooks#verify-manually

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { applyCashback, applyLoyaltyPoints } from '@/lib/loyalty/apply-rewards'

function verifyStripeSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=')
      return [key, value]
    })
  )
  const timestamp = parts['t']
  const signature = parts['v1']
  if (!timestamp || !signature) return false

  const signedPayload = `${timestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')

  if (expected.length !== signature.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('[webhook/stripe] STRIPE_WEBHOOK_SECRET não configurado')
    return NextResponse.json({ ok: true }) // 200 pra não entrar em retry — é config faltando, não vai se resolver sozinho
  }

  if (!verifyStripeSignature(rawBody, signatureHeader, webhookSecret)) {
    console.warn('[webhook/stripe] assinatura inválida')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(rawBody)

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ ok: true })
  }

  const session = event.data.object
  const sessionId: string = session.id
  const orderId: string | undefined = session.metadata?.order_id

  if (session.payment_status !== 'paid') {
    // Sessão concluída mas ainda não confirmada como paga (ex.: Pix
    // aguardando o cliente escanear) — nada a fazer ainda.
    return NextResponse.json({ ok: true })
  }

  try {
    const payment = await prisma.payment.findFirst({
      where: { provider: 'STRIPE', providerReference: sessionId },
      include: { order: { select: { id: true, tenantId: true, total: true, status: true, customerId: true, orderNumber: true } } },
    })

    if (!payment) {
      console.warn('[webhook/stripe] nenhum Payment encontrado pra sessão', sessionId, 'orderId no metadata:', orderId)
      return NextResponse.json({ ok: true })
    }

    if (payment.status === 'PAID') {
      return NextResponse.json({ ok: true }) // idempotência
    }

    // Mesma lógica das outras integrações: só confirma o PEDIDO quando a
    // soma de tudo que já foi pago cobre o total (pagamento dividido).
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: new Date(), webhookData: event },
      })
      if (updated.count === 0) return { processed: false as const }

      const paidPayments = await tx.payment.findMany({
        where: { orderId: payment.order.id, status: 'PAID' },
        select: { amount: true },
      })
      const totalPaid = paidPayments.reduce((s, p) => s + Number(p.amount), 0)
      const orderTotal = Number(payment.order.total)
      const isFullyPaid = Math.round(totalPaid * 100) >= Math.round(orderTotal * 100)

      await tx.order.update({
        where: { id: payment.order.id },
        data: isFullyPaid
          ? { paymentStatus: 'PAID', status: 'CONFIRMED', confirmedAt: new Date() }
          : { paymentStatus: 'PARTIAL' },
      })

      if (isFullyPaid && payment.order.customerId) {
        await applyCashback(tx, payment.tenantId, payment.order.customerId, payment.order.id, orderTotal)
        await applyLoyaltyPoints(tx, payment.tenantId, payment.order.customerId, payment.order.id, orderTotal)
      }

      return { processed: true as const, isFullyPaid }
    })

    if (result.processed) {
      console.log('[webhook/stripe] pagamento confirmado', { paymentId: payment.id, sessionId })
      await publishOrderEvent(payment.tenantId, {
        type: 'ORDER_UPDATED',
        orderId: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: result.isFullyPaid ? 'CONFIRMED' : payment.order.status,
        paymentStatus: result.isFullyPaid ? 'PAID' : 'PARTIAL',
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/stripe] erro ao processar evento', String(err))
    return NextResponse.json({ ok: true })
  }
}
