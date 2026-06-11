// app/(dashboard)/dashboard/reports/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { ReportsClient } from '@/components/dashboard/reports-client'
import { startOfMonth, subDays, startOfDay, endOfDay } from 'date-fns'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Relatórios' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ start?: string; end?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const tenantId = session.user.tenantId
  const now = new Date()
  const params = await searchParams

  // Período padrão: mês atual
  const defaultStart = startOfMonth(now)
  const startDate = params.start ? startOfDay(new Date(params.start)) : defaultStart
  const endDate   = params.end   ? endOfDay(new Date(params.end))     : endOfDay(now)

  // ── Faturamento diário no período ──────────────────────────────────────
  let revenueChart: Array<{ date: string; revenue: number; orders: number }> = []
  try {
    revenueChart = await prisma.$queryRaw<Array<{ date: string; revenue: number; orders: number }>>`
      SELECT
        DATE(created_at AT TIME ZONE 'America/Sao_Paulo') as date,
        COALESCE(SUM(total), 0)::float as revenue,
        COUNT(*)::int as orders
      FROM "Order"
      WHERE
        tenant_id = ${tenantId}
        AND payment_status = 'PAID'
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY date ASC
    `
  } catch (e) { console.error('[reports] revenueChart error:', e) }

  // ── Produtos mais vendidos no período ──────────────────────────────────
  const topProducts = await prisma.orderItem.groupBy({
    by: ['productId', 'productName'],
    where: {
      order: { tenantId, paymentStatus: 'PAID', createdAt: { gte: startDate, lte: endDate } },
    },
    _sum: { quantity: true, totalPrice: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 10,
  })

  // ── Vendas por tipo no período ─────────────────────────────────────────
  const salesByType = await prisma.order.groupBy({
    by: ['type'],
    where: { tenantId, paymentStatus: 'PAID', createdAt: { gte: startDate, lte: endDate } },
    _sum: { total: true },
    _count: { id: true },
  })

  // ── Vendas por forma de pagamento no período ───────────────────────────
  const salesByPayment = await prisma.payment.groupBy({
    by: ['method'],
    where: {
      order: { tenantId },
      status: 'PAID',
      paidAt: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
    _count: { id: true },
  })

  // ── Pico de pedidos por horário no período ─────────────────────────────
  let salesByHour: Array<{ hour: number; orders: number }> = []
  try {
    salesByHour = await prisma.$queryRaw<Array<{ hour: number; orders: number }>>`
      SELECT
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int as hour,
        COUNT(*)::int as orders
      FROM "Order"
      WHERE
        tenant_id = ${tenantId}
        AND payment_status = 'PAID'
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY hour
      ORDER BY hour
    `
  } catch (e) { console.error('[reports] salesByHour error:', e) }

  // ── Métricas do período vs período anterior equivalente ─────────────────
  const periodLen = endDate.getTime() - startDate.getTime()
  const prevStart = new Date(startDate.getTime() - periodLen)
  const prevEnd   = new Date(startDate.getTime() - 1)

  const [current, previous] = await Promise.all([
    prisma.order.aggregate({
      where: { tenantId, paymentStatus: 'PAID', createdAt: { gte: startDate, lte: endDate } },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.order.aggregate({
      where: { tenantId, paymentStatus: 'PAID', createdAt: { gte: prevStart, lte: prevEnd } },
      _sum: { total: true },
      _count: { id: true },
    }),
  ])

  const thisRevenue = Number(current._sum.total ?? 0)
  const prevRevenue = Number(previous._sum.total ?? 0)
  const revenueGrowth = prevRevenue > 0
    ? ((thisRevenue - prevRevenue) / prevRevenue) * 100
    : 0

  return (
    <ReportsClient
      revenueChart={revenueChart}
      topProducts={topProducts.map((p) => ({
        name: p.productName,
        quantity: p._sum.quantity ?? 0,
        revenue: Number(p._sum.totalPrice ?? 0),
      }))}
      salesByType={salesByType.map((s) => ({
        type: s.type,
        total: Number(s._sum.total ?? 0),
        count: s._count.id,
      }))}
      salesByPayment={salesByPayment.map((s) => ({
        method: s.method,
        total: Number(s._sum.amount ?? 0),
        count: s._count.id,
      }))}
      salesByHour={salesByHour}
      summary={{
        thisRevenue,
        prevRevenue,
        revenueGrowth,
        totalOrders: current._count.id,
        avgTicket: current._count.id > 0 ? thisRevenue / current._count.id : 0,
      }}
      startDate={startDate.toISOString().slice(0, 10)}
      endDate={endDate.toISOString().slice(0, 10)}
    />
  )
}
