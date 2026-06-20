// app/api/orders/[id]/mark-paid/route.ts
// Marca pagamentos em dinheiro ou cartão como PAID manualmente.
// PIX é confirmado automaticamente via webhook do Mercado Pago.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { applyOrderRewards } from '@/lib/loyalty/apply-rewards'
import { z } from 'zod'

const schema = z.object({
  paymentId: z.string().optional(), // se não informado, marca todos do pedido
})

// Apenas métodos manuais podem ser confirmados via esta rota
const MANUAL_METHODS = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'VOUCHER', 'TRANSFER']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Apenas admin, manager e attendant podem confirmar pagamento
  const allowedRoles = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'MASTER_ADMIN', 'STAFF', 'DELIVERY_PERSON']
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id: orderId } = await params
  const tenantId = session.user.tenantId

  let body: { paymentId?: string } = {}
  try { body = await request.json() } catch {}
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  // Verificar que o pedido pertence ao tenant
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      status: true,
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

  // ATTENDANT: não pode confirmar pagamento em pedidos de delivery
  if (session.user.role === 'ATTENDANT' && order.type === 'DELIVERY') {
    return NextResponse.json(
      { error: 'Atendentes não podem confirmar pagamento de pedidos de delivery.' },
      { status: 403 }
    )
  }

  const now = new Date()

  // Determinar quais pagamentos marcar como PAID
  const toUpdate = order.payments.filter((p) => {
    if (p.status === 'PAID') return false
    if (!MANUAL_METHODS.includes(p.method)) return false
    if (parsed.data.paymentId) return p.id === parsed.data.paymentId
    return true
  })

  if (toUpdate.length === 0) {
    return NextResponse.json({ error: 'Nenhum pagamento manual pendente encontrado' }, { status: 400 })
  }

  let becamePaid = false

  // Atualizar pagamentos em transação
  await prisma.$transaction(async (tx) => {
    for (const p of toUpdate) {
      await tx.payment.update({
        where: { id: p.id },
        data: { status: 'PAID', paidAt: now },
      })
    }

    // Verificar se todos os pagamentos do pedido estão pagos agora
    const allPayments = await tx.payment.findMany({
      where: { orderId },
      select: { status: true },
    })
    const allPaid = allPayments.every((p) => p.status === 'PAID')

    if (allPaid && order.paymentStatus !== 'PAID') {
      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID' },
      })
      becamePaid = true

      // Registrar no histórico quem confirmou o pagamento
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: order.status as any,
          userId: session.user.id,
          notes: `Pagamento confirmado manualmente por ${session.user.name ?? session.user.email}`,
        },
      })

      if (order.customerId) {
        await applyOrderRewards(tx, tenantId, order.customerId, orderId, Number(order.total))
      }
    }
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.PAYMENT_RECEIVED,
    resource: 'orders',
    resourceId: orderId,
    newValue: { action: 'mark_paid', paymentIds: toUpdate.map((p) => p.id), becamePaid },
  })

  // Publicar evento para atualização em tempo real
  try {
    await publishOrderEvent(tenantId, { type: 'PAYMENT_UPDATED', orderId })
  } catch {}

  return NextResponse.json({ ok: true, updatedCount: toUpdate.length, orderPaid: becamePaid })
}
