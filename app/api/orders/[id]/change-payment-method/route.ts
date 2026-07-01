// app/api/orders/[id]/change-payment-method/route.ts
//
// Troca a forma de pagamento de um Payment que AINDA NÃO foi confirmado
// (status PENDING). Usado quando o cliente muda de ideia antes de pagar
// (ex.: ia pagar PIX, decidiu pagar na maquininha na entrega).
//
// Pagamentos PAID ou FAILED nunca podem ser alterados por aqui — para
// esses casos o fluxo correto é registrar um novo pagamento (add-payment)
// ou reembolsar.
//
// Casos tratados:
//   - Manual → Manual (ex.: CASH → DEBIT_CARD): só atualiza o campo `method`.
//   - Manual → PIX: gera um novo QR Code no Mercado Pago e marca o
//     pagamento manual antigo como FAILED (substituído).
//   - PIX → Manual: marca o PIX pendente como FAILED (substituído) e cria
//     um novo Payment manual com o mesmo valor.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { resolveTenantMpAccessToken } from '@/lib/mercadopago/resolve-token'
import { z } from 'zod'

// CASHBACK é usado internamente pelo sistema de fidelidade — não é uma
// forma de pagamento que o lojista escolhe manualmente ao trocar aqui.
const ALLOWED_METHODS = ['PIX', 'CASH', 'CREDIT_CARD', 'CREDIT_CARD_MANUAL', 'DEBIT_CARD', 'VOUCHER'] as const

const bodySchema = z.object({
  paymentId: z.string().cuid(),
  method: z.enum(ALLOWED_METHODS),
})

const ALLOWED_ROLES = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF']

async function createPixPayment(params: { tenantId: string; orderId: string; amount: number }) {
  const accessToken = await resolveTenantMpAccessToken(params.tenantId)
  if (!accessToken) throw new Error('Mercado Pago não configurado')

  const response = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `${params.orderId}-pix-changemethod-${Date.now()}`,
    },
    body: JSON.stringify({
      transaction_amount: params.amount,
      payment_method_id: 'pix',
      payer: {
        email: 'onboarding@resend.dev',
        identification: { type: 'CPF', number: '00000000000' },
      },
      description: `Pedido #${params.orderId.slice(-8).toUpperCase()}`,
      external_reference: params.orderId,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`,
      date_of_expiration: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`MP Error: ${JSON.stringify(error)}`)
  }

  const mpData = await response.json()
  const pixQrCode       = mpData.point_of_interaction?.transaction_data?.qr_code as string | undefined
  const pixQrCodeBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64 as string | undefined
  const pixExpiresAt    = mpData.date_of_expiration
    ? new Date(mpData.date_of_expiration)
    : new Date(Date.now() + 5 * 60 * 1000)

  const created = await prisma.payment.create({
    data: {
      tenantId: params.tenantId,
      orderId: params.orderId,
      method: 'PIX',
      status: 'PENDING',
      amount: params.amount,
      mercadoPagoId: String(mpData.id),
      mercadoPagoStatus: mpData.status,
      pixQrCode,
      pixQrCodeBase64,
      pixExpiresAt,
    },
  })

  return { created, pixQrCode, pixQrCodeBase64 }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id: orderId } = await params
  const tenantId = session.user.tenantId

  let rawBody: unknown
  try { rawBody = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { paymentId, method } = parsed.data

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true, orderNumber: true, status: true,
      payments: { where: { id: paymentId }, select: { id: true, method: true, status: true, amount: true } },
    },
  })
  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }
  if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
    return NextResponse.json({ error: 'Pedido cancelado ou estornado.' }, { status: 422 })
  }

  const payment = order.payments[0]
  if (!payment) {
    return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 })
  }
  if (payment.status !== 'PENDING') {
    return NextResponse.json({ error: 'Só é possível trocar a forma de pagamento antes da confirmação.' }, { status: 422 })
  }
  if (payment.method === method) {
    return NextResponse.json({ ok: true, unchanged: true, paymentId: payment.id, method })
  }

  const amount = Number(payment.amount)
  const oldMethod = payment.method
  let pixQrCode: string | undefined
  let pixQrCodeBase64: string | undefined
  let resultPaymentId = payment.id
  let resultStatus = payment.status

  try {
    if (method === 'PIX') {
      // Qualquer método manual → PIX: gera cobrança nova e substitui a antiga.
      const pix = await createPixPayment({ tenantId, orderId, amount })
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failedAt: new Date() } })
      pixQrCode = pix.pixQrCode
      pixQrCodeBase64 = pix.pixQrCodeBase64
      resultPaymentId = pix.created.id
      resultStatus = 'PENDING'
    } else if (oldMethod === 'PIX') {
      // PIX → método manual: cancela o PIX pendente e cria o novo pagamento manual.
      const created = await prisma.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failedAt: new Date() } })
        return tx.payment.create({
          data: { tenantId, orderId, method: method as any, status: 'PENDING', amount },
        })
      })
      resultPaymentId = created.id
      resultStatus = created.status
    } else {
      // Troca simples entre dois métodos manuais.
      const updated = await prisma.payment.update({ where: { id: payment.id }, data: { method: method as any } })
      resultPaymentId = updated.id
      resultStatus = updated.status
    }
  } catch (err) {
    console.error('[change-payment-method] Erro:', err)
    return NextResponse.json({ error: 'Erro ao gerar novo pagamento PIX. Verifique as credenciais do Mercado Pago.' }, { status: 502 })
  }

  await prisma.orderStatusHistory.create({
    data: {
      orderId,
      status: order.status as any,
      userId: session.user.id,
      notes: `Forma de pagamento alterada de ${oldMethod} para ${method} por ${session.user.name ?? session.user.email}`,
    },
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.PAYMENT_METHOD_CHANGED,
    resource: 'orders',
    resourceId: orderId,
    oldValue: { paymentId: payment.id, method: oldMethod },
    newValue: { paymentId: resultPaymentId, method },
  })

  try { await publishOrderEvent(tenantId, { type: 'PAYMENT_UPDATED', orderId }) } catch {}

  return NextResponse.json({
    ok: true,
    replacedPaymentId: payment.id,
    paymentId: resultPaymentId,
    method,
    status: resultStatus,
    amount,
    ...(pixQrCode ? { pixQrCode, pixQrCodeBase64 } : {}),
  })
}
