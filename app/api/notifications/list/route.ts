// app/api/notifications/list/route.ts
//
// Devolve as notificações "ao vivo" do sininho — não é um log persistido,
// é calculado na hora a partir do estado atual do pedido/estoque. Por
// isso o "lido/não lido" não é gravado no banco: fica em localStorage no
// navegador (ver lib/utils/notification-read-state.ts), guardando o ID de
// cada item já visto. Simples e sem precisar de migração — o efeito
// colateral é que, se o mesmo fato acontecer de novo bem mais tarde (ex.:
// o mesmo produto ficar sem estoque de novo depois de repor), ele reusa o
// mesmo ID e pode aparecer "já lido" antes da hora; um trade-off aceitável
// pra não precisar de uma tabela nova só pra isso.
//
// Tipos de notificação:
//  - orders:       pedidos aguardando confirmação (PENDING/CONFIRMED)
//  - outOfStock:   produto com estoque zerado
//  - lowStock:     produto abaixo do mínimo configurado (mas não zerado)
//  - slowPrep:     pedido em preparo há mais tempo que o esperado
//  - slowDelivery: pedido pronto/saiu pra entrega há mais tempo que o esperado

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

// Limites configuráveis — dá pra ajustar sem mexer no código.
const PREP_ALERT_MINUTES     = Number(process.env.PREP_ALERT_MINUTES ?? 25)
const DELIVERY_ALERT_MINUTES = Number(process.env.DELIVERY_ALERT_MINUTES ?? 45)

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  const prepCutoff     = new Date(Date.now() - PREP_ALERT_MINUTES * 60_000)
  const deliveryCutoff = new Date(Date.now() - DELIVERY_ALERT_MINUTES * 60_000)

  const [pendingOrders, stockRows, slowPrepOrders, slowDeliveryOrders] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, orderNumber: true, total: true, type: true, createdAt: true,
        customer: { select: { name: true } },
      },
    }),
    // Um produto pode ter estoque em mais de um PDV — agrupamos por
    // produto pra não repetir o mesmo item várias vezes na lista.
    prisma.stock.findMany({
      where: { tenantId, minQuantity: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: {
        productId: true, quantity: true, minQuantity: true, updatedAt: true,
        product: { select: { name: true, isActive: true } },
      },
    }),
    // Pedido em preparo há tempo demais (sem ficar pronto ainda)
    prisma.order.findMany({
      where: { tenantId, status: 'PREPARING', preparingAt: { lt: prepCutoff } },
      orderBy: { preparingAt: 'asc' },
      take: 20,
      select: { id: true, orderNumber: true, preparingAt: true },
    }),
    // Pedido de delivery pronto/saiu pra entrega há tempo demais sem ser
    // marcado como entregue.
    prisma.order.findMany({
      where: {
        tenantId, type: 'DELIVERY',
        status: { in: ['READY', 'OUT_FOR_DELIVERY'] },
        readyAt: { lt: deliveryCutoff },
      },
      orderBy: { readyAt: 'asc' },
      take: 20,
      select: { id: true, orderNumber: true, readyAt: true },
    }),
  ])

  const seenProducts = new Set<string>()
  const outOfStock: Array<{ id: string; productId: string; productName: string; updatedAt: Date }> = []
  const lowStock: Array<{ id: string; productId: string; productName: string; quantity: number; updatedAt: Date }> = []

  for (const s of stockRows) {
    if (!s.product.isActive) continue // produto inativo/arquivado não precisa alertar
    if (seenProducts.has(s.productId)) continue
    seenProducts.add(s.productId)

    const qty = Number(s.quantity)
    const min = s.minQuantity != null ? Number(s.minQuantity) : null

    if (qty <= 0) {
      outOfStock.push({ id: `stock-out-${s.productId}`, productId: s.productId, productName: s.product.name, updatedAt: s.updatedAt })
    } else if (min != null && qty <= min) {
      lowStock.push({ id: `stock-low-${s.productId}`, productId: s.productId, productName: s.product.name, quantity: qty, updatedAt: s.updatedAt })
    }
  }

  return NextResponse.json({
    orders: pendingOrders.map((o) => ({
      id: `order-pending-${o.id}`,
      orderId: o.id,
      orderNumber: o.orderNumber,
      total: Number(o.total),
      type: o.type,
      createdAt: o.createdAt,
      customerName: o.customer?.name ?? null,
    })),
    outOfStock: outOfStock.slice(0, 20),
    lowStock: lowStock.slice(0, 20),
    slowPrep: slowPrepOrders.map((o) => ({
      id: `order-slow-prep-${o.id}`,
      orderId: o.id,
      orderNumber: o.orderNumber,
      minutesAgo: o.preparingAt ? Math.round((Date.now() - o.preparingAt.getTime()) / 60_000) : null,
    })),
    slowDelivery: slowDeliveryOrders.map((o) => ({
      id: `order-slow-delivery-${o.id}`,
      orderId: o.id,
      orderNumber: o.orderNumber,
      minutesAgo: o.readyAt ? Math.round((Date.now() - o.readyAt.getTime()) / 60_000) : null,
    })),
  })
}
