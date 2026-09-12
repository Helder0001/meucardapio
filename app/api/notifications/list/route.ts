// app/api/notifications/list/route.ts
//
// CORREÇÃO (#3): o sininho de notificações mostrava só UM item agregado
// ("Pedidos aguardando — N pendentes"), sem dar pra ver quais pedidos são
// esses sem clicar e ir pro Kanban. Também não avisava nada sobre produto
// esgotado. Esta rota devolve as duas listas separadas, já prontas pra
// renderizar item por item no dropdown (ver components/dashboard/header.tsx).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const [pendingOrders, outOfStockRows] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, orderNumber: true, total: true, type: true, createdAt: true,
        customer: { select: { name: true } },
      },
    }),
    // Um produto pode ter estoque zerado em mais de um PDV — agrupamos por
    // produto pra não repetir o mesmo item várias vezes na lista.
    prisma.stock.findMany({
      where: { tenantId, quantity: { lte: 0 } },
      orderBy: { updatedAt: 'desc' },
      select: { productId: true, updatedAt: true, product: { select: { name: true, isActive: true } } },
    }),
  ])

  const seenProducts = new Set<string>()
  const outOfStock = outOfStockRows
    .filter((s) => s.product.isActive) // produto inativo/arquivado não precisa alertar
    .filter((s) => {
      if (seenProducts.has(s.productId)) return false
      seenProducts.add(s.productId)
      return true
    })
    .slice(0, 20)
    .map((s) => ({ productId: s.productId, productName: s.product.name, updatedAt: s.updatedAt }))

  return NextResponse.json({
    orders: pendingOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      total: Number(o.total),
      type: o.type,
      createdAt: o.createdAt,
      customerName: o.customer?.name ?? null,
    })),
    outOfStock,
  })
}
