import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { ReportsClient } from '@/components/dashboard/reports-client'
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

// Converte "YYYY-MM-DD" para início/fim do dia no fuso de São Paulo (UTC-3)
const toSpStart = (d: string) => new Date(d + 'T00:00:00-03:00')
const toSpEnd   = (d: string) => new Date(d + 'T23:59:59-03:00')

// Retorna o início do mês atual no fuso SP
function startOfMonthSP(): Date {
  const now = new Date()
  const sp  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return toSpStart(`${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, '0')}-01`)
}

function buildPdvWhere(filterPdv: string, filterSaleType: string) {
  const pdvCondition = filterPdv === 'null'
    ? { pdvId: null }
    : filterPdv
      ? { pdvId: filterPdv }
      : {}
  const typeCondition = filterSaleType ? { type: filterSaleType as any } : {}
  return { ...pdvCondition, ...typeCondition }
}

async function queryRevenueChart(
  tenantId: string, startDate: Date, endDate: Date,
  filterPdv: string, filterSaleType: string,
  filterPayment: string, filterProduct: string,
): Promise<Array<{ date: string; revenue: number; orders: number }>> {
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
      createdAt: { gte: startDate, lte: endDate },
      ...buildPdvWhere(filterPdv, filterSaleType),
      ...(filterPayment ? { payments: { some: { method: filterPayment } } } : {}),
      ...(filterProduct ? { items: { some: { productId: filterProduct } } } : {}),
    },
    select: { total: true, createdAt: true },
  })
  const byDay = new Map<string, { revenue: number; orders: number }>()
  for (const o of orders) {
    const day = new Date(o.createdAt).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).split('/').reverse().join('-')
    const cur = byDay.get(day) ?? { revenue: 0, orders: 0 }
    cur.revenue += Number(o.total); cur.orders++
    byDay.set(day, cur)
  }
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({ date, revenue: d.revenue, orders: d.orders }))
}

// Versão simplificada para o período anterior (apenas revenue por dia)
async function queryRevenueChartSimple(
  tenantId: string, startDate: Date, endDate: Date,
): Promise<Array<{ date: string; revenue: number }>> {
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
      createdAt: { gte: startDate, lte: endDate },
    },
    select: { total: true, createdAt: true },
  })
  const byDay = new Map<string, number>()
  for (const o of orders) {
    const day = new Date(o.createdAt).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).split('/').reverse().join('-')
    byDay.set(day, (byDay.get(day) ?? 0) + Number(o.total))
  }
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, revenue]) => ({ date, revenue }))
}

async function queryHourChart(
  tenantId: string, startDate: Date, endDate: Date,
  filterPdv: string, filterSaleType: string,
  filterPayment: string, filterProduct: string,
): Promise<Array<{ hour: number; orders: number }>> {
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
      createdAt: { gte: startDate, lte: endDate },
      ...buildPdvWhere(filterPdv, filterSaleType),
      ...(filterPayment ? { payments: { some: { method: filterPayment } } } : {}),
      ...(filterProduct ? { items: { some: { productId: filterProduct } } } : {}),
    },
    select: { createdAt: true },
  })
  const byHour = new Map<number, number>()
  for (const o of orders) {
    const h = Number(new Intl.DateTimeFormat('pt-BR', {
      hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo',
    }).format(new Date(o.createdAt)))
    byHour.set(h, (byHour.get(h) ?? 0) + 1)
  }
  return Array.from(byHour.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, orders]) => ({ hour, orders }))
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const tenantId = session.user.tenantId
  const now      = new Date()
  const params   = await searchParams

  const defaultStart = startOfMonthSP()
  const startDate = params.start ? toSpStart(params.start) : defaultStart
  const endDate   = params.end   ? toSpEnd(params.end)     : toSpEnd(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))

  const filterPdv      = params.pdv      || ''
  const filterPayment  = params.payment  || ''
  const filterProduct  = params.product  || ''
  const filterSaleType = params.saleType || ''
  const filterUser     = params.user     || ''

  const baseWhere: any = {
    tenantId,
    status: PAID_STATUS_FILTER,
    createdAt: { gte: startDate, lte: endDate },
  }
  if (filterPdv === 'null') {
    baseWhere.pdvId = null
  } else if (filterPdv) {
    baseWhere.pdvId = filterPdv
  }
  if (filterSaleType) baseWhere.type = filterSaleType as OrderType
  if (filterUser) {
    baseWhere.statusHistory = {
      some: {
        userId: filterUser,
        notes: { contains: 'Pagamento confirmado' },
      },
    }
  }
  // Filtros de pagamento e produto aplicados globalmente
  if (filterPayment) baseWhere.payments = { some: { method: filterPayment } }
  if (filterProduct) baseWhere.items    = { some: { productId: filterProduct } }

  // Período anterior
  const periodLen = endDate.getTime() - startDate.getTime()
  const prevStart = new Date(startDate.getTime() - periodLen)
  const prevEnd   = new Date(startDate.getTime() - 1)

  // ── Listas para selects ──────────────────────────────────────────────────
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
      where: {
        tenantId,
        isActive: true,
        // filtra apenas roles válidas no enum atual — ignora valores legados como 'WAITER'
        role: {
          in: [
            'MASTER_ADMIN', 'TENANT_ADMIN', 'MANAGER',
            'ATTENDANT', 'STAFF', 'DELIVERY_PERSON',
          ] as any[],
        },
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // ── Gráficos de faturamento (atual + anterior) ───────────────────────────
  let revenueChart: Array<{ date: string; revenue: number; orders: number }> = []
  let revenueChartPrev: Array<{ date: string; revenue: number }> = []
  try {
    ;[revenueChart, revenueChartPrev] = await Promise.all([
      queryRevenueChart(tenantId, startDate, endDate, filterPdv, filterSaleType, filterPayment, filterProduct),
      queryRevenueChartSimple(tenantId, prevStart, prevEnd),
    ])
  } catch (e) { console.error('[reports] revenueChart error:', e) }

  // ── Pico por horário ─────────────────────────────────────────────────────
  let salesByHour: Array<{ hour: number; orders: number }> = []
  try {
    salesByHour = await queryHourChart(tenantId, startDate, endDate, filterPdv, filterSaleType, filterPayment, filterProduct)
  } catch (e) { console.error('[reports] salesByHour error:', e) }

  // ── Produtos mais vendidos ───────────────────────────────────────────────
  const productWhere: any = {
    order: { ...baseWhere },
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
  const salesByType = await prisma.order.groupBy({
    by: ['type'],
    where: { ...baseWhere },
    _sum: { total: true },
    _count: { id: true },
  })

  // ── Formas de pagamento ──────────────────────────────────────────────────
  const paymentWhere: any = {
    order: { ...baseWhere },
    status: 'PAID',
  }
  if (filterPayment) paymentWhere.method = filterPayment

  const salesByPayment = await prisma.payment.groupBy({
    by: ['method'],
    where: paymentWhere,
    _sum: { amount: true },
    _count: { id: true },
  })

  // ── Resumo atual vs anterior ─────────────────────────────────────────────
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
  const prevOrders    = previous._count.id
  const avgTicket     = current._count.id > 0 ? thisRevenue / current._count.id : 0
  const prevAvgTicket = previous._count.id > 0 ? prevRevenue / previous._count.id : 0

  // ── Clientes ─────────────────────────────────────────────────────────────
  // Usa telefone do customer para detectar recorrência, pois testes podem
  // criar múltiplos registros de Customer com o mesmo número.
  let totalClients = 0, newClients = 0, returningClients = 0, returnRate = 0
  try {
    const [currentOrders, prevOrders2] = await Promise.all([
      prisma.order.findMany({
        where: { ...baseWhere },
        select: { customerId: true, customer: { select: { phone: true } } },
      }),
      prisma.order.findMany({
        where: {
          tenantId,
          status: PAID_STATUS_FILTER,
          createdAt: { gte: prevStart, lte: prevEnd },
        },
        select: { customerId: true, customer: { select: { phone: true } } },
      }),
    ])

    // Agrupa por telefone (remove nulls e duplicatas)
    const currPhones = [...new Set(
      currentOrders
        .map((o) => o.customer?.phone)
        .filter(Boolean) as string[]
    )]
    const prevPhones = new Set(
      prevOrders2
        .map((o) => o.customer?.phone)
        .filter(Boolean) as string[]
    )

    totalClients     = currPhones.length
    returningClients = currPhones.filter((p) => prevPhones.has(p)).length
    newClients       = totalClients - returningClients
    returnRate       = totalClients > 0 ? (returningClients / totalClients) * 100 : 0
  } catch (e) { console.error('[reports] clients error:', e) }

  return (
    <ReportsClient
      revenueChart={revenueChart}
      revenueChartPrev={revenueChartPrev}
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
        totalOrders:     current._count.id,
        prevOrders,
        avgTicket,
        prevAvgTicket,
        totalClients,
        newClients,
        returningClients,
        returnRate,
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
