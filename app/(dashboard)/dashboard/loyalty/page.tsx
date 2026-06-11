// app/(dashboard)/dashboard/loyalty/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { LoyaltySettings } from '@/components/dashboard/loyalty-settings'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Fidelidade & Cashback' }

export default async function LoyaltyPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const tenantId = session.user.tenantId

  const [loyalty, cashback, stats] = await Promise.all([
    prisma.loyaltyConfig.findFirst({ where: { tenantId } }),
    prisma.cashbackConfig.findFirst({ where: { tenantId } }),
    prisma.customer.aggregate({
      where: { tenantId },
      _sum: { loyaltyPoints: true, cashbackBalance: true },
      _count: { id: true },
    }),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Fidelidade & Cashback</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Configure recompensas para seus clientes voltarem mais
        </p>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Clientes com pontos', value: stats._count.id.toLocaleString('pt-BR') },
          { label: 'Total de pontos ativos', value: (stats._sum.loyaltyPoints ?? 0).toLocaleString('pt-BR') },
          { label: 'Cashback disponível', value: `R$ ${Number(stats._sum.cashbackBalance ?? 0).toFixed(2)}` },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold text-foreground mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <LoyaltySettings
        loyalty={loyalty ? {
          pointsPerReal: Number(loyalty.pointsPerReal),
          redeemEvery:   loyalty.redeemEvery,
          redeemValue:   Number(loyalty.redeemValue),
          isActive:      loyalty.isActive,
        } : null}
        cashback={cashback ? {
          percentage:   Number(cashback.percentage),
          validityDays: cashback.validityDays,
          isActive:     cashback.isActive,
        } : null}
      />
    </div>
  )
}
