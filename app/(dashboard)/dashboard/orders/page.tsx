// app/(dashboard)/dashboard/orders/page.tsx
import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { OrdersTable } from '@/components/dashboard/orders-table'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pedidos' }

interface PageProps {
  searchParams: Promise<{
    page?: string
    status?: string
    type?: string
    q?: string
  }>
}

export default async function OrdersPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const params = await searchParams
  const tenantId = session.user.tenantId
  const page = Math.max(1, Number(params.page ?? 1))
  const pageSize = 20
  const skip = (page - 1) * pageSize

  const where = {
    tenantId,
    ...(params.status ? { status: params.status as any } : {}),
    ...(params.type   ? { type: params.type as any } : {}),
    ...(params.q
      ? {
          OR: [
            { customer: { name:  { contains: params.q, mode: 'insensitive' as const } } },
            { customer: { phone: { contains: params.q } } },
          ],
        }
      : {}),
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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