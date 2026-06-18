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

  // CORREÇÃO: remover filtro paymentStatus: 'PAID' da semana/mês
  // Cartão e dinheiro não passam por webhook de pagamento — o status fica PENDING
  // mas o pedido já foi entregue/confirmado. Contabilizamos por status do pedido.
  const [
    todayOrders,
    weekRevenue,
    monthRevenue,
    pendingOrders,
    recentOrders,
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
