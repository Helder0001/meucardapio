// app/api/webhooks/mercadopago/route.ts
// VERSÃO SEGURA — VULN-03 corrigido + ajustes de robustez
//
// CORREÇÃO VULN-03: Removido completamente o bypass de validação em desenvolvimento.
// O webhook SEMPRE valida a assinatura, independente do NODE_ENV.
// Para desenvolvimento: usar ngrok para receber webhooks reais do MP sandbox.
//
// AJUSTES NESTA VERSÃO:
// 1. Race condition: update atômico e condicional (updateMany) para evitar
//    cashback/pontos de fidelidade duplicados em webhooks concorrentes.
// 2. Validação de timestamp (ts) na assinatura — proteção contra replay attack.
// 3. Validação de formato do hash (v1) antes do timingSafeEqual.
// 4. Efeitos colaterais não-críticos (publishOrderEvent, auditLog) movidos
//    para after() — rodam depois da resposta, sem arriscar timeout na Vercel.
//    Cashback e pontos continuam DENTRO da transação (são críticos, precisam
//    ser atômicos com a confirmação do pagamento).

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { applyCashback, applyLoyaltyPoints } from '@/lib/loyalty/apply-rewards'
import crypto from 'crypto'

export const runtime = 'nodejs'

// Janela de tolerância para o timestamp da assinatura (segundos).
// Webhooks com 'ts' fora dessa janela são rejeitados (proteção contra replay).
const SIGNATURE_MAX_AGE_SECONDS = 300

// Formato esperado do HMAC SHA-256 em hex: 64 caracteres hexadecimais.
const HEX_SHA256_REGEX = /^[a-f0-9]{64}$/i

async function findPaymentByMpId(mercadoPagoId: string) {
  return prisma.payment.findFirst({
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
}

export async function POST(request: Request) {
  try {
    const body      = await request.text()
    const signature = request.headers.get('x-signature')
    const requestId = request.headers.get('x-request-id')

    let event: any
    try {
      event = JSON.parse(body)
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // Assinatura de pagamentos PIX é gerada pela conta do ESTABELECIMENTO no
    // Mercado Pago (arquitetura de credenciais duplas), não pela conta da
    // plataforma. Por isso o secret usado pra validar precisa ser o do tenant
    // (tenant.settings.mercadoPagoWebhookSecret), não o global. Eventos de
    // assinatura (cobrança do plano) continuam usando o secret da plataforma.
    let webhookSecret: string | null | undefined = process.env.MERCADOPAGO_WEBHOOK_SECRET

    // Buscar pagamento no banco (precisamos do tenant antes de validar a assinatura)
    let payment: Awaited<ReturnType<typeof findPaymentByMpId>> = null
    if (event.type === 'payment' && event.data?.id) {
      payment = await findPaymentByMpId(String(event.data.id))
      if (payment) {
        const tenant = await prisma.tenant.findFirst({
          where: { id: payment.order.tenantId },
          select: { settings: true },
        })
        const tenantSecret = (tenant?.settings as any)?.mercadoPagoWebhookSecret
        if (tenantSecret) webhookSecret = tenantSecret
      }
    }

    // VULN-03 CORRIGIDO: sem bypass — SEMPRE valida a assinatura
    if (!validateSignature(body, signature, requestId, webhookSecret)) {
      console.warn('[webhook/mp] Assinatura inválida rejeitada')
      // Retornar 401 sem revelar detalhes do erro
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    if (!payment) {

      // Pode ser pagamento de assinatura — ignorar silenciosamente
      return NextResponse.json({ ok: true })
    }

    // Verificar status atual na API do MP (não confiar apenas no payload)
    const mpPayment = await fetchPaymentFromMP(mercadoPagoId, payment.order.tenantId)
    if (!mpPayment) {
      // Falha ao consultar a API do MP. Mantemos o 500 de propósito: queremos
      // que o MP reenvie o webhook depois. Responder 200 aqui faria o
      // pagamento ficar "perdido" para sempre, sem nenhum retry.
      console.error('[webhook/mp] Não foi possível verificar pagamento na API do MP', { mercadoPagoId })
      return NextResponse.json({ error: 'Could not verify payment' }, { status: 500 })
    }

    const mpStatus = mpPayment.status

    // Processar apenas transições válidas (idempotência)
    if (mpStatus === 'approved' && payment.status !== 'PAID') {
      const processed = await prisma.$transaction(async (tx) => {
        // Update atômico e condicional: garante que, mesmo se dois webhooks
        // chegarem em paralelo (ou o MP reenviar), só um consiga transicionar
        // o pagamento para PAID. O outro recebe count === 0 e sai sem
        // duplicar cashback/pontos de fidelidade.
        const updated = await tx.payment.updateMany({
          where: { id: payment.id, status: { not: 'PAID' } },
          data: {
            status: 'PAID',
            mercadoPagoStatus: mpStatus,
            paidAt: new Date(),
            webhookData: mpPayment as any,
          },
        })

        if (updated.count === 0) {
          // Outro webhook concorrente já processou este pagamento.
          return false
        }

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

        return true
      })

      if (processed) {
        // Efeitos colaterais não-críticos: não precisam ser atômicos com o
        // pagamento, então rodam depois da resposta ser enviada ao MP — evita
        // arriscar estourar o tempo de execução da function na Vercel.
        after(async () => {
          try {
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
          } catch (err) {
            // Já respondemos ao MP, então só logamos — não há mais como
            // retornar erro pra ninguém aqui.
            console.error('[webhook/mp] Erro em efeito colateral pós-resposta:', err)
          }
        })
      }
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

    // CORREÇÃO: quando o PIX expira (5 min), o MP manda o pagamento como
    // "cancelled" — sem tratar isso aqui, o pedido ficava travado pra sempre
    // em "Aguardando confirmação PIX" mesmo depois de expirado.
    if (mpStatus === 'cancelled' && payment.status === 'PENDING') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', mercadoPagoStatus: mpStatus, failedAt: new Date() },
      })
      await prisma.order.update({
        where: { id: payment.order.id },
        data: { paymentStatus: 'FAILED' },
      })

      // CORREÇÃO: cancelar o pedido automaticamente quando o PIX expira —
      // só se ainda estiver PENDING (não cancela se a loja já confirmou/avançou
      // o pedido por outro meio, ex.: combinou pagamento em dinheiro na entrega).
      if (payment.order.status === 'PENDING') {
        await prisma.order.update({
          where: { id: payment.order.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: 'PIX expirado sem pagamento',
          },
        })
      }
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
function validateSignature(
  body: string,
  signature: string | null,
  requestId: string | null,
  webhookSecret: string | null | undefined,
): boolean {
  // Se não tiver secret resolvido (nem do tenant, nem o global) → SEMPRE rejeitar
  if (!webhookSecret) {
    console.error('[webhook/mp] Nenhum webhook secret configurado (tenant nem plataforma)!')
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

    // Proteção contra replay attack: rejeita assinaturas antigas demais.
    // Um atacante que capture uma requisição válida não pode reenviá-la
    // depois da janela de tolerância.
    const tsNumber = Number(ts)
    if (!Number.isFinite(tsNumber)) return false
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsNumber)
    if (ageSeconds > SIGNATURE_MAX_AGE_SECONDS) {
      console.warn('[webhook/mp] Assinatura rejeitada: timestamp fora da janela', { ageSeconds })
      return false
    }

    // Valida o formato do hash ANTES de converter para Buffer — evita
    // comparar buffers de tamanhos diferentes (hex inválido/truncado) no
    // timingSafeEqual.
    if (!HEX_SHA256_REGEX.test(v1)) return false

    let parsedBody: any
    try { parsedBody = JSON.parse(body) } catch { return false }

    const dataId   = parsedBody?.data?.id ?? ''
    const manifest = `id:${dataId};request-id:${requestId ?? ''};ts:${ts};`

    const hmac    = crypto.createHmac('sha256', webhookSecret)
    hmac.update(manifest)
    const computed = hmac.digest('hex')

    // Comparação timing-safe para prevenir timing attacks
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

// applyCashback e applyLoyaltyPoints agora vêm de lib/loyalty/apply-rewards
// (compartilhado com a rota de confirmação manual de pagamento /api/orders/[id]/mark-paid)

// ── Handler para webhooks de assinatura (preapproval) ────────────────────────
// Usa SEMPRE as credenciais da PLATAFORMA (MERCADOPAGO_ACCESS_TOKEN), nunca as
// credenciais do estabelecimento. Isso está correto por design: a assinatura
// (preapproval) é a cobrança do plano do Meu Cardápio para o tenant — quem
// RECEBE esse dinheiro é a plataforma, não o restaurante. As credenciais do
// estabelecimento (tenant.settings.mercadoPagoAccessToken) servem só para os
// pagamentos PIX dos clientes finais do restaurante. Não trocar isso.

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
