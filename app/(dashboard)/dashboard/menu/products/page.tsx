// app/(dashboard)/dashboard/menu/products/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { ProductsList } from '@/components/dashboard/products-list'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Produtos' }

export default async function ProductsPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const tenantId = session.user.tenantId

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        name: true,
        price: true,
        isActive: true,
        isFeatured: true,
        isBestSeller: true,
        soldCount: true,
        image: true,
        category: { select: { name: true } },
      },
    }),
    prisma.category.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const serialized = products.map((p) => ({ ...p, price: Number(p.price) }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {products.length} produto{products.length !== 1 ? 's' : ''} cadastrado{products.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/dashboard/menu/products/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium text-sm rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo produto
        </Link>
      </div>

      <ProductsList products={serialized} categories={categories} />
    </div>
  )
}
