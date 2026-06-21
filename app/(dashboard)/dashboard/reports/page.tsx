// app/(dashboard)/dashboard/reports/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { ReportsClient } from '@/components/dashboard/reports-client'
import { startOfMonth, startOfDay, endOfDay } from 'date-fns'
import type { Metadata } from 'next'
import type { OrderStatus, OrderType } from '@prisma/client'

export const metadata: Metadata = { title: 'Relatórios — Meu Cardápio' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    start?: string; end?: string
    pdv?: string; payment?: string; product?: string; saleType?: string; user?: string
  }>
}

const PAID_STATUS_FILTER = { notIn: ['CANCELLED', 'REFUNDED'] as OrderStatus[] }

// ── Helpers de query raw ─────────────────────────────────────────────────────
// Cada função usa tagged template literal diretamente (padrão que funciona no projeto).
// Variantes separadas por combinação de filtros opcionais para evitar composição
// dinâmica de Prisma.sql que pode corromper os índices de bind parameters.

async function queryRevenueChart(
  tenantId: string, startDate: Date, endDate: Date,
  filterPdv: string, filterSaleType: string,
): Promise<Array<{ date: string; revenue: number; orders: number }>> {
  type Row = { date: unknown; revenue: unknown; orders: unknown }

  let raw: Row[]

  if (filterPdv && filterSaleType) {
    raw = await prisma.$queryRaw<Row[]>`
      SELECT DATE("createdAt" AT TIME ZONE 'America/Sao_Paulo')::text AS date,
             COALESCE(SUM(total), 0)::float                          AS revenue,
             COUNT(*)::float                                         AS orders
      FROM "Order"
      WHERE "tenantId"   = ${tenantId}
        AND status     NOT IN ('CANCELLED', 'REFUNDED')
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
        AND "pdvId"      = ${filterPdv}
        AND type::text  = ${filterSaleType}
      GROUP BY DATE("createdAt" AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY date ASC`
  } else if (filterPdv) {
    raw = await prisma.$queryRaw<Row[]>`
      SELECT DATE("createdAt" AT TIME ZONE 'America/Sao_Paulo')::text AS date,
             COALESCE(SUM(total), 0)::float                          AS revenue,
             COUNT(*)::float                                         AS orders
      FROM "Order"
      WHERE "tenantId"   = ${tenantId}
        AND status     NOT IN ('CANCELLED', 'REFUNDED')
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
        AND "pdvId"      = ${filterPdv}
      GROUP BY DATE("createdAt" AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY date ASC`
  } else if (filterSaleType) {
    raw = await prisma.$queryRaw<Row[]>`
      SELECT DATE("createdAt" AT TIME ZONE 'America/Sao_Paulo')::text AS date,
             COALESCE(SUM(total), 0)::float                          AS revenue,
             COUNT(*)::float                                         AS orders
      FROM "Order"
      WHERE "tenantId"   = ${tenantId}
        AND status     NOT IN ('CANCELLED', 'REFUNDED')
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
        AND type::text  = ${filterSaleType}
      GROUP BY DATE("createdAt" AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY date ASC`
  } else {
    raw = await prisma.$queryRaw<Row[]>`
      SELECT DATE("createdAt" AT TIME ZONE 'America/Sao_Paulo')::text AS date,
             COALESCE(SUM(total), 0)::float                          AS revenue,
             COUNT(*)::float                                         AS orders
      FROM "Order"
      WHERE "tenantId"   = ${tenantId}
        AND status     NOT IN ('CANCELLED', 'REFUNDED')
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
      GROUP BY DATE("createdAt" AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY date ASC`
  }

  return raw.map((r) => ({ date: String(r.date), revenue: Number(r.revenue), orders: Number(r.orders) }))
}

async function queryHourChart(
  tenantId: string, startDate: Date, endDate: Date,
  filterPdv: string, filterSaleType: string,
): Promise<Array<{ hour: number; orders: number }>> {
  type Row = { hour: unknown; orders: unknown }

  let raw: Row[]

  if (filterPdv && filterSaleType) {
    raw = await prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
             COUNT(*)::float                                                      AS orders
      FROM "Order"
      WHERE "tenantId"   = ${tenantId}
        AND status     NOT IN ('CANCELLED', 'REFUNDED')
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
        AND "pdvId"      = ${filterPdv}
        AND type::text  = ${filterSaleType}
      GROUP BY EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY hour`
  } else if (filterPdv) {
    raw = await prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
             COUNT(*)::float                                                      AS orders
      FROM "Order"
      WHERE "tenantId"   = ${tenantId}
        AND status     NOT IN ('CANCELLED', 'REFUNDED')
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
        AND "pdvId"      = ${filterPdv}
      GROUP BY EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY hour`
  } else if (filterSaleType) {
    raw = await prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
             COUNT(*)::float                                                      AS orders
      FROM "Order"
      WHERE "tenantId"   = ${tenantId}
        AND status     NOT IN ('CANCELLED', 'REFUNDED')
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
        AND type::text  = ${filterSaleType}
      GROUP BY EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY hour`
  } else {
    raw = await prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
             COUNT(*)::float                                                      AS orders
      FROM "Order"
      WHERE "tenantId"   = ${tenantId}
        AND status     NOT IN ('CANCELLED', 'REFUNDED')
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
      GROUP BY EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY hour`
  }

  return raw.map((r) => ({ hour: Number(r.hour), orders: Number(r.orders) }))
}

// ─────────────────────────────────────────────────────────────────────────────
export default async function ReportsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const tenantId = session.user.tenantId
  const now      = new Date()
  const params   = await searchParams

  const defaultStart = startOfMonth(now)
  const startDate = params.start ? startOfDay(new Date(params.start)) : defaultStart
  const endDate   = params.end   ? endOfDay(new Date(params.end))     : endOfDay(now)

  // ── Filtros avançados ────────────────────────────────────────────────────
  const filterPdv      = params.pdv      || ''
  const filterPayment  = params.payment  || ''
  const filterProduct  = params.product  || ''
  const filterSaleType = params.saleType || ''
  const filterUser     = params.user     || ''

  // Cláusula base para Prisma ORM
  const baseWhere: any = {
    tenantId,
    status: PAID_STATUS_FILTER,
    createdAt: { gte: startDate, lte: endDate },
  }
  if (filterPdv)      baseWhere.pdvId    = filterPdv
  if (filterSaleType) baseWhere.type     = filterSaleType as OrderType
  if (filterUser) {
    // Filtra pedidos onde esse usuário confirmou pagamento
    // (nota de histórico contém "Pagamento confirmado manualmente")
    baseWhere.statusHistory = {
      some: {
        userId: filterUser,
        notes: { contains: 'Pagamento confirmado' },
      },
    }
  }

  // ── Listas para os selects ───────────────────────────────────────────────
  const [pdvList, productList, userList] = await Promise.all([
    prisma.pDV.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // ── Faturamento diário ───────────────────────────────────────────────────
  let revenueChart: Array<{ date: string; revenue: number; orders: number }> = []
  try {
    revenueChart = await queryRevenueChart(tenantId, startDate, endDate, filterPdv, filterSaleType)
  } catch (e) { console.error('[reports] revenueChart error:', e) }

  // ── Pico por horário ─────────────────────────────────────────────────────
  let salesByHour: Array<{ hour: number; orders: number }> = []
  try {
    salesByHour = await queryHourChart(tenantId, startDate, endDate, filterPdv, filterSaleType)
  } catch (e) { console.error('[reports] salesByHour error:', e) }

  // ── Produtos mais vendidos ───────────────────────────────────────────────
  // CORREÇÃO: faltava aplicar o filtro de forma de pagamento aqui — antes só
  // respeitava pdv/tipo/data/produto, então filtrar por pagamento não mudava nada.
  const productWhere: any = {
    order: {
      ...baseWhere,
      ...(filterPayment ? { payments: { some: { method: filterPayment, status: 'PAID' } } } : {}),
    },
  }
  if (filterProduct) productWhere.productId = filterProduct

  const topProducts = await prisma.orderItem.groupBy({
    by: ['productId', 'productName'],
    where: productWhere,
    _sum: { quantity: true, totalPrice: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 10,
  })

  // ── Vendas por tipo ──────────────────────────────────────────────────────
  // CORREÇÃO: faltava aplicar os filtros de pagamento e produto — antes só
  // respeitava pdv/tipo/data, então esses dois filtros não mudavam o gráfico.
  const salesByType = await prisma.order.groupBy({
    by: ['type'],
    where: {
      ...baseWhere,
      ...(filterPayment ? { payments: { some: { method: filterPayment, status: 'PAID' } } } : {}),
      ...(filterProduct ? { items: { some: { productId: filterProduct } } } : {}),
    },
    _sum: { total: true },
    _count: { id: true },
  })

  // ── Vendas por forma de pagamento ────────────────────────────────────────
  const paymentWhere: any = {
    order: {
      ...baseWhere,
      ...(filterProduct ? { items: { some: { productId: filterProduct } } } : {}),
    },
    status: 'PAID',
  }
  if (filterPayment) paymentWhere.method = filterPayment

  const salesByPayment = await prisma.payment.groupBy({
    by: ['method'],
    where: paymentWhere,
    _sum: { amount: true },
    _count: { id: true },
  })

  // ── Resumo vs período anterior ───────────────────────────────────────────
  const periodLen = endDate.getTime() - startDate.getTime()
  const prevStart = new Date(startDate.getTime() - periodLen)
  const prevEnd   = new Date(startDate.getTime() - 1)

  const [current, previous] = await Promise.all([
    prisma.order.aggregate({
      where: baseWhere,
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.order.aggregate({
      where: { tenantId, status: PAID_STATUS_FILTER, createdAt: { gte: prevStart, lte: prevEnd } },
      _sum: { total: true },
      _count: { id: true },
    }),
  ])

  const thisRevenue   = Number(current._sum.total  ?? 0)
  const prevRevenue   = Number(previous._sum.total ?? 0)
  const revenueGrowth = prevRevenue > 0 ? ((thisRevenue - prevRevenue) / prevRevenue) * 100 : 0

  return (
    <ReportsClient
      revenueChart={revenueChart}
      topProducts={topProducts.map((p) => ({
        id:       p.productId,
        name:     p.productName,
        quantity: p._sum.quantity  ?? 0,
        revenue:  Number(p._sum.totalPrice ?? 0),
      }))}
      salesByType={salesByType.map((s) => ({
        type:  s.type,
        total: Number(s._sum.total ?? 0),
        count: s._count.id,
      }))}
      salesByPayment={salesByPayment.map((s) => ({
        method: s.method,
        total:  Number(s._sum.amount ?? 0),
        count:  s._count.id,
      }))}
      salesByHour={salesByHour}
      summary={{
        thisRevenue,
        prevRevenue,
        revenueGrowth,
        totalOrders: current._count.id,
        avgTicket:   current._count.id > 0 ? thisRevenue / current._count.id : 0,
      }}
      startDate={startDate.toISOString().slice(0, 10)}
      endDate={endDate.toISOString().slice(0, 10)}
      pdvList={pdvList}
      productList={productList}
      userList={userList}
      filterPdv={filterPdv}
      filterPayment={filterPayment}
      filterProduct={filterProduct}
      filterSaleType={filterSaleType}
      filterUser={filterUser}
    />
  )
}
