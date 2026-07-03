// app/(dashboard)/dashboard/orders/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { OrdersTable } from '@/components/dashboard/orders-table'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pedidos' }
// CORREÇÃO: force-dynamic garante que searchParams (page, status, etc.)
// sempre causem nova busca no servidor — sem isso a paginação não funcionava.
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    page?: string
    status?: string
    type?: string
    paymentStatus?: string
    payment?: string
    q?: string
    sort?: string
    dir?: string
  }>
}

const SORTABLE_FIELDS: Record<string, string> = {
  total: 'total',
  date: 'createdAt',
}

export default async function OrdersPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const params = await searchParams
  const tenantId = session.user.tenantId
  const page = Math.max(1, Number(params.page ?? 1))
  const pageSize = 20
  const skip = (page - 1) * pageSize

  // CORREÇÃO: suporte a busca por número de pedido além de nome/telefone
  const qNum = params.q && !isNaN(Number(params.q)) ? Number(params.q) : null

  const role = session.user.role
  const isDeliveryPerson = role === 'DELIVERY_PERSON'

  // Multi-PDV isolation
  let pdvFilter: object = {}
  if (!['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(role)) {
    const pdvAccess = await prisma.pDVUser.findMany({
      where: { userId: session.user.id },
      select: { pdvId: true, pdv: { select: { type: true } } },
    })
    if (pdvAccess.length > 0) {
      const pdvIds = pdvAccess.map((p) => p.pdvId)
      const hasDeliveryPdv = pdvAccess.some((p) => p.pdv.type === 'DELIVERY')
      pdvFilter = hasDeliveryPdv
        ? { OR: [{ pdvId: { in: pdvIds } }, { pdvId: null, type: 'DELIVERY' }] }
        : { pdvId: { in: pdvIds } }
    }
  }

  const where = {
    tenantId,
    ...pdvFilter,
    // Entregador só vê pedidos do tipo DELIVERY
    ...(isDeliveryPerson ? { type: 'DELIVERY' as const } : {}),
    ...(params.status        ? { status:        params.status        as any } : {}),
    ...(params.type && !isDeliveryPerson ? { type: params.type as any } : {}),
    ...(params.paymentStatus ? { paymentStatus:  params.paymentStatus as any } : {}),
    ...(params.payment       ? {
      payments: { some: { method: params.payment as any } }
    } : {}),
    ...(params.q
      ? qNum !== null
        ? { orderNumber: qNum }
        : {
            OR: [
              { customer: { name:  { contains: params.q, mode: 'insensitive' as const } } },
              { customer: { phone: { contains: params.q } } },
            ],
          }
      : {}),
  }

  const sortField = SORTABLE_FIELDS[params.sort ?? ''] ?? 'createdAt'
  const sortDir = params.dir === 'asc' ? 'asc' : 'desc'

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip,
      take: pageSize,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        type: true,
        total: true,
        createdAt: true,
        deliveryBairro: true,
        customer: { select: { name: true, phone: true } },
        table:    { select: { number: true } },
        waiter:   { select: { name: true } },
        pdv:      { select: { name: true } },
        payments: { select: { method: true }, take: 3 },
        _count:   { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ])

  const serialized = orders.map((o) => ({
    ...o,
    total: Number(o.total),
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {total} pedido{total !== 1 ? 's' : ''} no total
        </p>
      </div>
      <OrdersTable
        orders={serialized}
        total={total}
        page={page}
        pageSize={pageSize}
        currentFilters={params}
      />
    </div>
  )
}
