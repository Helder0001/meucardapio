// app/(dashboard)/dashboard/menu/addons/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { AddonsManager } from '@/components/dashboard/addons-manager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Adicionais' }

export default async function AddonsPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/dashboard')

  const groups = await prisma.addonGroup.findMany({
    where:   { tenantId: session.user.tenantId },
    orderBy: { createdAt: 'asc' },
    include: {
      addons: {
        orderBy: { sortOrder: 'asc' },
        select:  { id: true, name: true, price: true, isActive: true, sortOrder: true },
      },
      _count: {
        select: { products: true },
      },
    },
  })

  const serialized = groups.map((g) => ({
    ...g,
    addons: g.addons.map((a) => ({ ...a, price: Number(a.price) })),
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Grupos de Adicionais</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Crie grupos de opções que podem ser vinculados a produtos
        </p>
      </div>
      <AddonsManager groups={serialized} />
    </div>
  )
}
