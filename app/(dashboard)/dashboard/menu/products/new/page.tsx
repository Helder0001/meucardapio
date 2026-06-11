// app/(dashboard)/dashboard/menu/products/new/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { ProductForm } from '@/components/dashboard/product-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Novo Produto' }

export default async function NewProductPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const categories = await prisma.category.findMany({
    where: { tenantId: session.user.tenantId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  })

  if (categories.length === 0) {
    redirect('/dashboard/menu/categories')
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Novo produto</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Preencha as informações do produto
        </p>
      </div>
      <ProductForm categories={categories} />
    </div>
  )
}
