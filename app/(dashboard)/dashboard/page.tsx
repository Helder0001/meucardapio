// app/(dashboard)/dashboard/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { MetricsCards } from '@/components/dashboard/metrics-cards'
import { RecentOrders } from '@/components/dashboard/recent-orders'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard' }

// Revalidar a cada 60 segundos (dados do dashboard)
export const revalidate = 60

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const tenantId = session.user.tenantId
  const now = new Date()
  const todayStart = startOfDay(now)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)

  // Buscar métricas em paralelo (Promise.all = mais rápido)
  const [
    todayOrders,
    weekRevenue,
    monthRevenue,
    pendingOrders,
    recentOrders,
  ] = await Promise.all([
    // Pedidos hoje
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: todayStart },
        status: { not: 'CANCELLED' },
      },
      _count: { id: true },
      _sum: { total: true },
    }),

    // Faturamento da semana
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: weekStart },
        paymentStatus: 'PAID',
      },
      _sum: { total: true },
    }),

    // Faturamento do mês
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: monthStart },
        paymentStatus: 'PAID',
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
  ])

  const metrics = {
    todayOrdersCount: todayOrders._count.id,
    todayRevenue: Number(todayOrders._sum.total ?? 0),
    weekRevenue: Number(weekRevenue._sum.total ?? 0),
    monthRevenue: Number(monthRevenue._sum.total ?? 0),
    monthOrdersCount: monthRevenue._count.id,
    avgTicket:
      monthRevenue._count.id > 0
        ? Number(monthRevenue._sum.total ?? 0) / monthRevenue._count.id
        : 0,
    pendingOrders,
  }

  return (
    <div className="space-y-6">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Visão geral do seu estabelecimento
        </p>
      </div>

      {/* Ações rápidas */}
      <QuickActions tenantId={tenantId} pendingCount={pendingOrders} />

      {/* Cards de métricas */}
      <MetricsCards metrics={metrics} />

      {/* Pedidos recentes */}
      <RecentOrders orders={recentOrders} />
    </div>
  )
}
