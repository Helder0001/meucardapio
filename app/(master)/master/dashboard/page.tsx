// app/(master)/master/dashboard/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { formatCurrency } from '@/lib/utils/format'
import { MasterMetricsCards } from '@/components/master/master-metrics'
import { TenantsTable } from '@/components/master/tenants-table'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Master Dashboard' }
export const revalidate = 60

export default async function MasterDashboard() {
  const session = await auth()
  if (session?.user?.role !== 'MASTER_ADMIN') redirect('/login')

  const [
    totalTenants,
    activeTenants,
    trialTenants,
    suspendedTenants,
    activeSubscriptionsForMrr,
    recentTenants,
    ordersToday,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { isActive: true, subscriptionStatus: 'ACTIVE' } }),
    prisma.tenant.count({ where: { subscriptionStatus: 'TRIAL' } }),
    prisma.tenant.count({ where: { subscriptionStatus: 'SUSPENDED' } }),

    // MRR: soma das assinaturas ativas, normalizando anuais (÷12) — sem
    // isso, um plano anual infla o MRR com o valor do ano inteiro de uma vez.
    prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
      select: { amount: true, billingCycle: true },
    }),

    // Últimos 10 tenants
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        subscription: { select: { plan: true, status: true, amount: true } },
        _count: { select: { orders: true, users: true } },
      },
    }),

    // Pedidos das últimas 24h na plataforma toda
    prisma.order.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ])

  const mrr = activeSubscriptionsForMrr.reduce(
    (sum, s) => sum + (s.billingCycle === 'ANNUAL' ? Number(s.amount) / 12 : Number(s.amount)),
    0
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Painel Master</h1>
        <p className="text-muted-foreground text-sm">
          Visão geral da plataforma
        </p>
      </div>

      <MasterMetricsCards
        metrics={{
          totalTenants,
          activeTenants,
          trialTenants,
          suspendedTenants,
          mrr,
          arr: mrr * 12,
          ordersToday,
        }}
      />

      <div className="bg-card border border-border rounded-xl">
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">Estabelecimentos recentes</h2>
        </div>
        <TenantsTable tenants={recentTenants.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          plan: t.plan,
          subscriptionStatus: t.subscriptionStatus,
          createdAt: t.createdAt,
          ordersCount: t._count.orders,
          usersCount: t._count.users,
          monthlyRevenue: t.subscription ? Number(t.subscription.amount) : 0,
        }))} />
      </div>
    </div>
  )
}
