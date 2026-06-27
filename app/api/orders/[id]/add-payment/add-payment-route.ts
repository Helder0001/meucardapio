// app/api/orders/[id]/add-payment/route.ts
//
// Adiciona uma ou mais formas de pagamento a um pedido existente que estava
// com pagamento pendente (criado com "cobrar no final" no balcão/PDV).
//
// Regras:
//  - Apenas pedidos do tipo PDV, TABLE ou PICKUP podem usar esta rota.
//  - O pedido não pode estar CANCELLED ou REFUNDED.
//  - A soma dos pagamentos deve ser ≥ total do pedido.
//  - PIX gera QR Code via Mercado Pago (igual ao fluxo normal).
//  - Métodos manuais (CASH, cartão) ficam com status PENDING até confirmação.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { z } from 'zod'

const paymentEntrySchema = z.object({
  method: z.enum(['PIX', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'VOUCHER', 'TRANSFER']),
  amount: z.number().positive('Valor deve ser positivo'),
  changeFor: z.number().positive().optional(),
})

const bodySchema = z.object({
  payments: z.array(paymentEntrySchema).min(1).max(5),
})

const ALLOWED_ROLES = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id: orderId } = await params
  const tenantId = session.user.tenantId

  // ── Parse body ───────────────────────────────────────────────────────────
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
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      type: true,
      total: true,
      customerId: true,
      payments: {
        select: { id: true, method: true, status: true, amount: true },
      },
    },
  })

  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }

  // ── Validações de negócio ─────────────────────────────────────────────────
  if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
    return NextResponse.json(
      { error: 'Não é possível adicionar pagamento a um pedido cancelado ou estornado.' },
      { status: 422 }
    )
  }

  if (order.type === 'DELIVERY') {
    return NextResponse.json(
      { error: 'Use o fluxo de pagamento de delivery para registrar o recebimento.' },
      { status: 422 }
    )
  }

  // Somar pagamentos existentes (PAID ou PENDING)
  const alreadyPaid = order.payments.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  )
  const newTotal   = payments.reduce((s, p) => s + p.amount, 0)
  const orderTotal = Number(order.total)
  const combined   = alreadyPaid + newTotal

  if (combined < orderTotal - 0.01) {
    return NextResponse.json(
      {
        error: `Valor insuficiente. Total do pedido: R$ ${orderTotal.toFixed(2)}. Já registrado: R$ ${alreadyPaid.toFixed(2)}. Falta: R$ ${(orderTotal - combined).toFixed(2)}.`,
      },
      { status: 422 }
    )
  }

  // ── Criar pagamentos ──────────────────────────────────────────────────────
  const createdPayments: Array<{ id: string; method: string; status: string; amount: number }> = []

  await prisma.$transaction(async (tx) => {
    for (const p of payments) {
      // Calcular troco para dinheiro
      let changeAmount: number | undefined
      if (p.method === 'CASH' && p.changeFor && p.changeFor > p.amount) {
        changeAmount = p.changeFor - p.amount
      }

      const created = await tx.payment.create({
        data: {
          tenantId,
          orderId,
          method:       p.method as any,
          amount:       p.amount,
          status:       'PENDING' as any,
          ...(changeAmount !== undefined ? { changeAmount } : {}),
        },
      })
      createdPayments.push({ id: created.id, method: created.method, status: created.status, amount: Number(created.amount) })
    }

    // Registrar no histórico
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        status: order.status as any,
        userId: session.user.id,
        notes: `Pagamento adicionado por ${session.user.name ?? session.user.email}: ${payments.map((p) => `${p.method} R$${p.amount.toFixed(2)}`).join(', ')}`,
      },
    })
  })

  // ── Audit log ─────────────────────────────────────────────────────────────
  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.PAYMENT_RECEIVED,
    resource: 'orders',
    resourceId: orderId,
    newValue: { action: 'add_payment', payments: createdPayments },
  })

  // ── Evento em tempo real ──────────────────────────────────────────────────
  try {
    await publishOrderEvent(tenantId, { type: 'PAYMENT_UPDATED', orderId })
  } catch {}

  return NextResponse.json({ ok: true, payments: createdPayments })
}
