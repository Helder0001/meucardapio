// app/api/orders/[id]/update-status/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { notifyOrderStatus } from '@/lib/messaging/evolution'
import { restockCancelledOrder, revalidateStorefrontForTenant } from '@/lib/utils/stock'
import { z } from 'zod'

const ROLE_LABELS: Record<string, string> = {
  TENANT_ADMIN: 'Administrador', MANAGER: 'Gerente',
  ATTENDANT: 'Atendente', STAFF: 'Operador', DELIVERY_PERSON: 'Entregador',
}

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

const STAFF_ALLOWED_STATUSES = ['CONFIRMED', 'CANCELLED', 'DELIVERED']

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

  const order = await prisma.order.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, orderNumber: true, waiterId: true, type: true, pdvId: true },
  })

  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }

  // Multi-PDV isolation: usuários restritos só podem alterar pedidos do seu PDV
  if (!['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(role)) {
    const pdvAccess = await prisma.pDVUser.findMany({
      where: { userId: session.user.id },
      select: { pdvId: true },
    })
    if (pdvAccess.length > 0 && order.pdvId) {
      const allowed = pdvAccess.map((p) => p.pdvId)
      if (!allowed.includes(order.pdvId)) {
        return NextResponse.json({ error: 'Sem permissão para este pedido.' }, { status: 403 })
      }
    }
  }

  const isDelivery = order.type === 'DELIVERY'

  // STAFF: não pode marcar como DELIVERED
  if (role === 'STAFF' && status === 'DELIVERED') {
    return NextResponse.json({ error: 'Operadores não podem marcar pedidos como entregues.' }, { status: 403 })
  }

  // ATTENDANT: não pode cancelar pedidos
  if (role === 'ATTENDANT' && status === 'CANCELLED') {
    return NextResponse.json({ error: 'Atendentes não podem cancelar pedidos.' }, { status: 403 })
  }

  // DELIVERY_PERSON: não pode cancelar
  if (role === 'DELIVERY_PERSON' && status === 'CANCELLED') {
    return NextResponse.json({ error: 'Entregadores não podem cancelar pedidos.' }, { status: 403 })
  }

  // DELIVERY_PERSON: só DELIVERY, só OUT_FOR_DELIVERY e DELIVERED
  if (role === 'DELIVERY_PERSON') {
    if (!isDelivery) {
      return NextResponse.json({ error: 'Entregadores só atuam em pedidos de delivery.' }, { status: 403 })
    }
    if (!['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(status)) {
      return NextResponse.json({ error: 'Entregadores só podem marcar saiu para entrega ou entregue.' }, { status: 403 })
    }
  }

  // STAFF e ATTENDANT: não podem marcar DELIVERED em pedidos DELIVERY
  if ((role === 'STAFF' || role === 'ATTENDANT') && isDelivery && status === 'DELIVERED') {
    return NextResponse.json({ error: 'Sem permissão para marcar pedidos de delivery como entregues.' }, { status: 403 })
  }

  // ATTENDANT e STAFF: não podem avançar para OUT_FOR_DELIVERY
  if ((role === 'ATTENDANT' || role === 'STAFF') && status === 'OUT_FOR_DELIVERY') {
    return NextResponse.json({ error: 'Sem permissão para marcar pedido como saiu para entrega.' }, { status: 403 })
  }

  // STAFF: só pode confirmar, preparar (via kanban drag?), cancelar — bloqueios mínimos
  if (role === 'STAFF' && !['CONFIRMED', 'PREPARING', 'READY', 'CANCELLED', 'DELIVERED'].includes(status)) {
    return NextResponse.json({ error: 'Operação não permitida para este perfil.' }, { status: 403 })
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
    ...(role === 'STAFF' && !order.waiterId ? { waiterId: session.user.id } : {}),
  }

  let affectedProductIds: string[] = []
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: updateData })
    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        status,
        userId: session.user.id,
        notes: cancelReason
          ? cancelReason
          : `Alterado por ${session.user.name ?? session.user.email} (${ROLE_LABELS[role] ?? role})`,
      },
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

    // Devolver ao estoque tudo que foi debitado na criação do pedido,
    // já que o cancelamento implica que os itens não serão entregues.
    if (status === 'CANCELLED') {
      const result = await restockCancelledOrder(tx, { tenantId, orderId: id })
      affectedProductIds = result.affectedProductIds
    }
  })

  if (affectedProductIds.length > 0) {
    await revalidateStorefrontForTenant(tenantId)
  }

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
