// app/(dashboard)/dashboard/stock/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { StockManager } from '@/components/dashboard/stock-manager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Estoque' }

export default async function StockPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/dashboard')

  const tenantId = session.user.tenantId

  const [stocks, products, pdvs] = await Promise.all([
    prisma.stock.findMany({
      where: { tenantId },
      orderBy: [{ product: { name: 'asc' } }],
      select: {
        id: true,
        quantity: true,
        minQuantity: true,
        unit: true,
        updatedAt: true,
        product: { select: { id: true, name: true, image: true, isActive: true } },
        pdv: { select: { id: true, name: true } },
      },
    }),
    prisma.product.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.pDV.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const serialized = stocks.map((s) => ({
    ...s,
    quantity: Number(s.quantity),
    minQuantity: s.minQuantity !== null ? Number(s.minQuantity) : null,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Estoque</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Controle a quantidade disponível de cada produto por loja/PDV.
          Vendas debitam automaticamente e cancelamentos devolvem ao estoque.
        </p>
      </div>

      <StockManager stocks={serialized} products={products} pdvs={pdvs} />
    </div>
  )
}
