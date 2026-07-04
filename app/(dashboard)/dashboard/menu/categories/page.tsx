// app/(dashboard)/dashboard/menu/categories/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { CategoriesManager } from '@/components/dashboard/categories-manager'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Categorias' }

export default async function CategoriesPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/dashboard')

  const categories = await prisma.category.findMany({
    where:   { tenantId: session.user.tenantId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, name: true, description: true, image: true,
      sortOrder: true, isActive: true,
      _count: { select: { products: { where: { isActive: true } } } },
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Categorias</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Organize seu cardápio em categorias
          </p>
        </div>
        <Link href="/dashboard/menu/products"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Ver produtos →
        </Link>
      </div>
      <CategoriesManager categories={categories} />
    </div>
  )
}
