// app/(dashboard)/dashboard/coupons/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { CouponsManager } from '@/components/dashboard/coupons-manager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cupons' }

export default async function CouponsPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const coupons = await prisma.coupon.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, code: true, description: true,
      type: true, value: true, minOrderValue: true,
      usageLimit: true, usageCount: true, expiresAt: true,
      isActive: true, createdAt: true,
    },
  })

  const serialized = coupons.map((c) => ({
    ...c,
    value:         Number(c.value),
    minOrderValue: c.minOrderValue ? Number(c.minOrderValue) : null,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cupons</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Crie descontos para atrair e fidelizar clientes
        </p>
      </div>
      <CouponsManager coupons={serialized} />
    </div>
  )
}
