// app/(dashboard)/dashboard/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { MetricsCards } from '@/components/dashboard/metrics-cards'
import { RecentOrders } from '@/components/dashboard/recent-orders'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { startOfWeek, startOfMonth } from 'date-fns'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Meu Cardápio' }

// Revalidar a cada 60 segundos (dados do dashboard)
export const revalidate = 60

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const role = session.user.role
  // Roles sem acesso ao Dashboard → redireciona para o Kanban
  if (['STAFF', 'DELIVERY_PERSON', 'ATTENDANT'].includes(role)) {
    redirect('/dashboard/orders/kanban')
  }

  const tenantId = session.user.tenantId
  const now = new Date()
  // FIX: Calcular o início do dia no fuso horário de Brasília (America/Sao_Paulo, UTC-3).
  // Convertemos "agora" para o horário local BR, zeramos h/m/s/ms e convertemos de volta para UTC.
  const nowBR = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  nowBR.setHours(0, 0, 0, 0)
  // Offset entre UTC e BR no momento atual (pode ser -3h ou -2h no horário de verão)
  const offsetMs = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getTime()
  const todayStart = new Date(nowBR.getTime() + offsetMs)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)

  // Períodos anteriores, pra calcular a variação percentual (↑/↓) nos cards
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
  const prevWeekStart  = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  const prevMonthStart = startOfMonth(new Date(monthStart.getTime() - 1))

  // CORREÇÃO: remover filtro paymentStatus: 'PAID' da semana/mês
  // Cartão e dinheiro não passam por webhook de pagamento — o status fica PENDING
  // mas o pedido já foi entregue/confirmado. Contabilizamos por status do pedido.
  const [
    todayOrders,
    weekRevenue,
    monthRevenue,
    pendingOrders,
    recentOrders,
    yesterdayOrders,
    prevWeekRevenue,
    prevMonthRevenue,
  ] = await Promise.all([
    // Pedidos hoje (excluindo cancelados)
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: todayStart },
        status: { not: 'CANCELLED' },
      },
      _count: { id: true },
      _sum: { total: true },
    }),

    // Faturamento da semana — pedidos não cancelados
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: weekStart },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      _sum: { total: true },
    }),

    // Faturamento do mês — pedidos não cancelados
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: monthStart },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      _sum: { total: true },
      _count: { id: true },
    }),

    // Pedidos pendentes/em preparo
    prisma.order.count({
      where: {
        tenantId,
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING'] },
      },
    }),

    // Últimos 5 pedidos
    prisma.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        total: true,
        type: true,
        createdAt: true,
        customer: {
          select: { name: true, phone: true },
        },
      },
    }),

    // Ontem (mesmo horário até agora), pra comparar com hoje
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: yesterdayStart, lt: todayStart },
        status: { not: 'CANCELLED' },
      },
      _sum: { total: true },
    }),

    // Semana anterior, pra comparar com a semana atual
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: prevWeekStart, lt: weekStart },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      _sum: { total: true },
    }),

    // Mês anterior, pra comparar com o mês atual
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: prevMonthStart, lt: monthStart },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      _sum: { total: true },
    }),
  ])

  // Variação percentual vs período anterior — null quando não dá pra comparar
  // (período anterior sem nenhum pedido ainda, ex.: loja muito nova)
  const pctChange = (current: number, previous: number): number | null => {
    if (previous <= 0) return null
    return ((current - previous) / previous) * 100
  }

  const todayRevenue = Number(todayOrders._sum.total ?? 0)
  const weekRevenueTotal = Number(weekRevenue._sum.total ?? 0)
  const monthRevenueTotal = Number(monthRevenue._sum.total ?? 0)
  const yesterdayRevenue = Number(yesterdayOrders._sum.total ?? 0)
  const prevWeekTotal = Number(prevWeekRevenue._sum.total ?? 0)
  const prevMonthTotal = Number(prevMonthRevenue._sum.total ?? 0)

  const metrics = {
    todayOrdersCount: todayOrders._count.id,
    todayRevenue,
    weekRevenue: weekRevenueTotal,
    monthRevenue: monthRevenueTotal,
    monthOrdersCount: monthRevenue._count.id,
    avgTicket:
      monthRevenue._count.id > 0
        ? monthRevenueTotal / monthRevenue._count.id
        : 0,
    pendingOrders,
    // Comparação com o período anterior — "hoje" é aproximado (compara com
    // o dia inteiro de ontem, não o mesmo horário), suficiente pra dar a
    // direção da tendência sem precisar de uma janela exata.
    todayChangePct: pctChange(todayRevenue, yesterdayRevenue),
    weekChangePct: pctChange(weekRevenueTotal, prevWeekTotal),
    monthChangePct: pctChange(monthRevenueTotal, prevMonthTotal),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Visão geral do seu estabelecimento
        </p>
      </div>

      <QuickActions tenantId={tenantId} pendingCount={pendingOrders} />
      <MetricsCards metrics={metrics} />
      <RecentOrders orders={recentOrders} />
    </div>
  )
}
