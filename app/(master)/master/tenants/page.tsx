// app/(master)/master/tenants/page.tsx
//
// Estava linkado no menu (app/(master)/layout.tsx) mas a página nunca
// tinha sido criada — mesma situação do /master/billing antes (13/07).

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { TenantsTable } from '@/components/master/tenants-table'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Estabelecimentos — Master' }
export const dynamic = 'force-dynamic'

export default async function MasterTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await auth()
  if (session?.user?.role !== 'MASTER_ADMIN') redirect('/login')

  const { q } = await searchParams
  const search = q?.trim()

  const tenants = await prisma.tenant.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      subscription: { select: { plan: true, status: true, amount: true } },
      _count: { select: { orders: true, users: true } },
    },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Estabelecimentos</h1>
        <p className="text-muted-foreground text-sm">
          {tenants.length} estabelecimento{tenants.length === 1 ? '' : 's'} {search ? `encontrado(s) para "${search}"` : 'cadastrado(s)'}
        </p>
      </div>

      <form className="max-w-sm">
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Buscar por nome ou URL..."
          className="w-full px-4 py-2.5 border border-border rounded-xl text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </form>

      <div className="bg-card border border-border rounded-xl">
        <TenantsTable tenants={tenants.map((t) => ({
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

        {tenants.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Nenhum estabelecimento encontrado.
          </div>
        )}
      </div>
    </div>
  )
}
