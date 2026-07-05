// app/api/orders/[id]/route.ts
//
// GET individual de um pedido, no mesmo formato usado pelo card do Kanban.
// Usado pelo componente KanbanBoard para buscar os dados completos de um
// pedido que ainda não está na lista em memória — tanto quando um pedido
// novo é criado (evento ORDER_CREATED) quanto quando um pedido balcão/mesa
// já ENTREGUE é reaberto (evento ORDER_UPDATED voltando para PENDING).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const tenantId = session.user.tenantId
  const userId = session.user.id
  const role = session.user.role

  // Multi-PDV isolation — mesma regra da rota /api/orders/kanban
  if (!['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(role)) {
    const pdvAccess = await prisma.pDVUser.findMany({
      where: { userId },
      select: { pdvId: true, pdv: { select: { type: true } } },
    })
    if (pdvAccess.length > 0) {
      const pdvIds = pdvAccess.map((p) => p.pdvId)
      const hasDeliveryPdv = pdvAccess.some((p) => p.pdv.type === 'DELIVERY')
      const order = await prisma.order.findFirst({
        where: { id, tenantId },
        select: { pdvId: true, type: true },
      })
      if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const allowed = order.pdvId
        ? pdvIds.includes(order.pdvId)
        : hasDeliveryPdv && order.type === 'DELIVERY'
      if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const order = await prisma.order.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      type: true,
      total: true,
      createdAt: true,
      notes: true,
      deliveryBairro: true,
      kitchenRound: true,
      table: { select: { number: true, sector: true } },
      customer: { select: { name: true, phone: true } },
      waiter: { select: { name: true } },
      pdv: { select: { name: true } },
      items: {
        select: {
          id: true,
          productName: true,
          quantity: true,
          notes: true,
          kitchenRound: true,
          addons: { select: { addonName: true } },
        },
      },
    },
  })

  if (!order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...order,
    total: Number(order.total),
    items: order.kitchenRound > 0
      ? order.items.filter((i) => i.kitchenRound === order.kitchenRound)
      : order.items,
  })
}
