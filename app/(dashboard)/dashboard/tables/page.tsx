// app/(dashboard)/dashboard/tables/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { TablesManager } from '@/components/dashboard/tables-manager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mesas' }

export default async function TablesPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/dashboard')

  const tenantId = session.user.tenantId

  const [tables, pdvs, tenant] = await Promise.all([
    prisma.table.findMany({
      where: { tenantId },
      orderBy: [{ sector: 'asc' }, { number: 'asc' }],
      select: {
        id: true,
        number: true,
        sector: true,
        capacity: true,
        status: true,
        isActive: true,
        qrCode: true,
        pdv: { select: { id: true, name: true } },
        _count: { select: { orders: { where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } } } },
      },
    }),
    prisma.pDV.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
    }),
    prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { slug: true, tableQrViewOnly: true },
    }),
  ])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mesas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {tables.length} mesa{tables.length !== 1 ? 's' : ''} cadastrada{tables.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <TablesManager
        tables={tables}
        pdvs={pdvs}
        tenantSlug={tenant?.slug ?? ''}
        tableQrViewOnly={tenant?.tableQrViewOnly ?? false}
      />
    </div>
  )
}
