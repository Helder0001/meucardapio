// app/(dashboard)/dashboard/delivery/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { DeliveryZonesManager } from '@/components/dashboard/delivery-zones-manager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Zonas de Entrega' }

export default async function DeliveryPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/dashboard')

  const zones = await prisma.deliveryZone.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { sortOrder: 'asc' },
  })

  const serialized = zones.map((z) => ({
    ...z,
    fee:       Number(z.fee),
    freeAbove: z.freeAbove ? Number(z.freeAbove) : null,
    minOrder:  z.minOrder  ? Number(z.minOrder)  : null,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Zonas de Entrega</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Configure bairros, taxas e valores mínimos de entrega
        </p>
      </div>
      <DeliveryZonesManager zones={serialized} />
    </div>
  )
}
