// app/(dashboard)/dashboard/pdv/page.tsx
//
// NOVO: página de gerenciamento Multi-PDV (Pontos de Venda).
// Anteriormente o link existia na sidebar mas a página não existia,
// causando "Página não encontrada".

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { PdvManager } from '@/components/dashboard/pdv-manager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Multi-PDV — Meu Cardápio' }
export const dynamic = 'force-dynamic'

const PLAN_ORDER = { STARTER: 0, PRO: 1, PREMIUM: 2 } as const

export default async function PdvPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    redirect('/dashboard')
  }

  const tenantId = session.user.tenantId
  const plan = session.user.plan ?? 'STARTER'
  const hasAccess = PLAN_ORDER[plan as keyof typeof PLAN_ORDER] >= PLAN_ORDER.PRO

  const [pdvs, users] = await Promise.all([
    prisma.pDV.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: {
        users: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        _count: { select: { orders: true, tables: true } },
      },
    }),
    prisma.user.findMany({
      where: { tenantId, isActive: true, role: { in: ['ATTENDANT', 'WAITER', 'MANAGER'] } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const serialized = pdvs.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    isActive: p.isActive,
    address: (p.address as any)?.full ?? '',
    ordersCount: p._count.orders,
    tablesCount: p._count.tables,
    linkedUserIds: p.users.map((u) => u.user.id),
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Multi-PDV</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Gerencie pontos de venda — lojas, quiosques e delivery — e vincule usuários a cada um.
        </p>
      </div>

      {!hasAccess && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-semibold">Recurso disponível no plano Pro</p>
          <p className="text-xs mt-0.5">
            O Multi-PDV permite gerenciar múltiplos pontos de venda (lojas, quiosques, delivery) com mesas,
            pedidos e equipes independentes. Faça upgrade do seu plano para habilitar esta funcionalidade.
          </p>
        </div>
      )}

      <PdvManager pdvs={serialized} users={users} hasAccess={hasAccess} />
    </div>
  )
}
