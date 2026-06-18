// app/(dashboard)/dashboard/menu/products/[id]/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { ProductEditForm } from '@/components/dashboard/product-edit-form'
import { BackButton } from '@/components/shared/back-button'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Editar Produto' }

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const { id } = await params
  const tenantId = session.user.tenantId

  const [product, categories, addonGroups] = await Promise.all([
    prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        addonGroups: {
          include: {
            addonGroup: {
              include: { addons: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    }),
    prisma.category.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.addonGroup.findMany({
      where: { tenantId },
      include: { addons: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    }),
  ])

  if (!product) notFound()

  const serialized = {
    ...product,
    price:        Number(product.price),
    comparePrice: product.comparePrice ? Number(product.comparePrice) : null,
    addonGroupIds: product.addonGroups.map((ag) => ag.addonGroupId),
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        {/* CORREÇÃO: BackButton é Client Component — não pode ter onClick num Server Component */}
        <BackButton />
        <h1 className="text-2xl font-bold text-foreground">Editar produto</h1>
      </div>
      <ProductEditForm
        product={serialized}
        categories={categories}
        allAddonGroups={addonGroups.map((g) => ({
          ...g,
          addons: g.addons.map((a) => ({ ...a, price: Number(a.price) })),
        }))}
      />
    </div>
  )
}
