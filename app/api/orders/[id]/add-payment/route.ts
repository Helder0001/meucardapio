// app/api/orders/[id]/add-payment/route.ts
//
// Adiciona pagamento a um pedido existente (criado com "cobrar no final").
// PIX gera QR Code via Mercado Pago igual ao fluxo normal.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { resolveTenantMpAccessToken } from '@/lib/mercadopago/resolve-token'
import { z } from 'zod'

const paymentEntrySchema = z.object({
  method: z.enum(['PIX', 'CASH', 'CREDIT_CARD', 'CREDIT_CARD_MANUAL', 'DEBIT_CARD', 'VOUCHER', 'TRANSFER']),
  amount: z.number().positive('Valor deve ser positivo'),
  changeFor: z.number().positive().optional(),
})

const bodySchema = z.object({
  payments: z.array(paymentEntrySchema).min(1).max(5),
})

const ALLOWED_ROLES = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF']

// ── Gera PIX no Mercado Pago e salva o Payment ────────────────────────────────
async function createPixPayment(params: {
  tenantId: string
  orderId: string
  amount: number
}) {
  const accessToken = await resolveTenantMpAccessToken(params.tenantId)
  if (!accessToken) throw new Error('Mercado Pago não configurado')

  const response = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `${params.orderId}-pix-addpay-${params.amount}`,
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
      tenantId:          params.tenantId,
      orderId:           params.orderId,
      method:            'PIX',
      status:            'PENDING',
      amount:            params.amount,
      mercadoPagoId:     String(mpData.id),
      mercadoPagoStatus: mpData.status,
      pixQrCode,
      pixQrCodeBase64,
      pixExpiresAt,
    },
  })

  return { created, pixQrCode, pixQrCodeBase64 }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id: orderId } = await params
  const tenantId = session.user.tenantId

  // ── Parse body ────────────────────────────────────────────────────────────
  let rawBody: unknown
  try { rawBody = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { payments } = parsed.data

  // ── Buscar pedido ─────────────────────────────────────────────────────────
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true, orderNumber: true, status: true,
      paymentStatus: true, type: true, total: true, customerId: true,
      payments: { select: { id: true, method: true, status: true, amount: true } },
    },
  })
  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }

  // ── Validações ────────────────────────────────────────────────────────────
  if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
    return NextResponse.json({ error: 'Pedido cancelado ou estornado.' }, { status: 422 })
  }
  if (order.type === 'DELIVERY') {
    return NextResponse.json({ error: 'Use o fluxo de pagamento de delivery.' }, { status: 422 })
  }

  const alreadyPaid = order.payments.reduce((s, p) => s + Number(p.amount), 0)
  const newTotal    = payments.reduce((s, p) => s + p.amount, 0)
  const orderTotal  = Number(order.total)

  if (alreadyPaid + newTotal < orderTotal - 0.01) {
    return NextResponse.json({
      error: `Valor insuficiente. Total: R$${orderTotal.toFixed(2)}. Já registrado: R$${alreadyPaid.toFixed(2)}. Falta: R$${(orderTotal - alreadyPaid - newTotal).toFixed(2)}.`,
    }, { status: 422 })
  }

  // ── Criar pagamentos ──────────────────────────────────────────────────────
  const createdPayments: Array<{ id: string; method: string; status: string; amount: number }> = []
  let pixQrCode: string | undefined
  let pixQrCodeBase64: string | undefined

  for (const p of payments) {
    if (p.method === 'PIX') {
      // PIX: gera QR Code no Mercado Pago (fora da transaction para evitar timeout)
      try {
        const pixResult = await createPixPayment({ tenantId, orderId, amount: p.amount })
        createdPayments.push({
          id: pixResult.created.id,
          method: 'PIX',
          status: 'PENDING',
          amount: Number(pixResult.created.amount),
        })
        // Só guarda o QR do primeiro PIX (caso split)
        if (!pixQrCode) {
          pixQrCode       = pixResult.pixQrCode
          pixQrCodeBase64 = pixResult.pixQrCodeBase64
        }
      } catch (err) {
        console.error('[add-payment] PIX error:', err)
        return NextResponse.json({
          error: 'Erro ao gerar PIX. Verifique as credenciais do Mercado Pago.',
        }, { status: 502 })
      }
    } else {
      // Métodos manuais: cria direto no banco
      let changeAmount: number | undefined
      if (p.method === 'CASH' && p.changeFor && p.changeFor > p.amount) {
        changeAmount = p.changeFor - p.amount
      }
      const created = await prisma.payment.create({
        data: {
          tenantId,
          orderId,
          method: p.method as any,
          amount: p.amount,
          status: 'PENDING' as any,
          ...(changeAmount !== undefined ? { changeAmount } : {}),
        },
      })
      createdPayments.push({
        id: created.id,
        method: created.method,
        status: created.status,
        amount: Number(created.amount),
      })
    }
  }

  // Registrar no histórico
  await prisma.orderStatusHistory.create({
    data: {
      orderId,
      status: order.status as any,
      userId: session.user.id,
      notes: `Pagamento adicionado por ${session.user.name ?? session.user.email}: ${payments.map((p) => `${p.method} R$${p.amount.toFixed(2)}`).join(', ')}`,
    },
  })

  // ── Audit + evento ────────────────────────────────────────────────────────
  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.PAYMENT_RECEIVED,
    resource: 'orders',
    resourceId: orderId,
    newValue: { action: 'add_payment', payments: createdPayments },
  })
  try { await publishOrderEvent(tenantId, { type: 'PAYMENT_UPDATED', orderId }) } catch {}

  return NextResponse.json({
    ok: true,
    payments: createdPayments,
    // Se teve PIX, retorna os dados para exibir o QR Code na tela
    ...(pixQrCode ? { pixQrCode, pixQrCodeBase64 } : {}),
  })
}
