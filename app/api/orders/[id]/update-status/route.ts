// app/api/orders/[id]/update-status/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { notifyOrderStatus } from '@/lib/messaging/evolution'
import { z } from 'zod'

const updateSchema = z.object({
  status: z.enum([
    'PENDING', 'CONFIRMED', 'PREPARING',
    'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
  ]),
  cancelReason: z.string().max(200).optional(),
})

const STATUS_TIMESTAMPS: Record<string, string> = {
  CONFIRMED: 'confirmedAt',
  PREPARING: 'preparingAt',
  READY:     'readyAt',
  DELIVERED: 'deliveredAt',
  CANCELLED: 'cancelledAt',
}

const WAITER_ALLOWED_STATUSES = ['CONFIRMED', 'CANCELLED', 'DELIVERED']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    )
  }

  const { status, cancelReason } = parsed.data
  const tenantId = session.user.tenantId
  const role = session.user.role

  if (role === 'WAITER' && !WAITER_ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: 'Garçons só podem confirmar, cancelar ou marcar pedidos como entregues.' },
      { status: 403 }
    )
  }

  const order = await prisma.order.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, orderNumber: true, waiterId: true },
  })

  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }

  const allowedTransitions: Record<string, string[]> = {
    PENDING:          ['CONFIRMED', 'CANCELLED'],
    CONFIRMED:        ['PREPARING', 'CANCELLED'],
    PREPARING:        ['READY', 'CANCELLED'],
    READY:            ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
    DELIVERED:        [],
    CANCELLED:        [],
  }

  if (!allowedTransitions[order.status]?.includes(status)) {
    return NextResponse.json(
      { error: `Transição inválida: ${order.status} → ${status}` },
      { status: 422 }
    )
  }

  const timestampField = STATUS_TIMESTAMPS[status]
  const updateData: Record<string, unknown> = {
    status,
    ...(timestampField ? { [timestampField]: new Date() } : {}),
    ...(status === 'CANCELLED' && cancelReason ? { cancelReason } : {}),
    ...(role === 'WAITER' && !order.waiterId ? { waiterId: session.user.id } : {}),
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: updateData })
    await tx.orderStatusHistory.create({
      data: { orderId: id, status, userId: session.user.id, notes: cancelReason },
    })

    // CORREÇÃO: incrementar soldCount dos produtos ao entregar o pedido.
    // Feito dentro da mesma transaction para garantir consistência.
    if (status === 'DELIVERED') {
      const items = await tx.orderItem.findMany({
        where: { orderId: id },
        select: { productId: true, quantity: true },
      })
      for (const item of items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { soldCount: { increment: item.quantity } },
          }).catch(() => {
            // Produto pode ter sido deletado após o pedido — ignora silenciosamente
          })
        }
      }
    }
  })

  await publishOrderEvent(tenantId, {
    type: 'ORDER_UPDATED',
    orderId: id,
    orderNumber: order.orderNumber,
    status,
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.ORDER_STATUS_CHANGED,
    resource: 'orders',
    resourceId: id,
    oldValue: { status: order.status },
    newValue: { status, waiterId: updateData.waiterId ?? order.waiterId },
  })

  const STATUS_TO_EVENT: Record<string, string> = {
    CONFIRMED:        'ORDER_CONFIRMED',
    PREPARING:        'ORDER_PREPARING',
    READY:            'READY',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED:        'DELIVERED',
    CANCELLED:        'CANCELLED',
  }
  const whatsappEvent = STATUS_TO_EVENT[status]
  if (whatsappEvent) {
    notifyOrderStatus(id, whatsappEvent as any).catch((err) =>
      console.error('[updateStatus] WhatsApp notification failed:', err)
    )
  }

  return NextResponse.json({ ok: true, status })
}
