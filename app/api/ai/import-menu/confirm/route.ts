// app/api/ai/import-menu/confirm/route.ts
//
// Recebe as categorias/produtos JÁ REVISADOS pelo usuário na tela de
// prévia (podem ter sido editados ou desmarcados) e grava de verdade no
// banco — só aqui o cardápio importado passa a existir de fato.
//
// Categoria existente com o mesmo nome (case-insensitive) é reaproveitada
// em vez de duplicada; produtos sempre são criados como novos registros.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { invalidateMenu } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { checkProductLimit } from '@/lib/db/tenant'
import { importedMenuSchema } from '@/lib/ai/menu-import-schema'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const tenantId = session.user.tenantId

  const body = await request.json().catch(() => null)
  const parsed = importedMenuSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
  const { categories } = parsed.data

  const totalNewProducts = categories.reduce((sum, c) => sum + c.products.length, 0)
  if (totalNewProducts === 0) {
    return NextResponse.json({ error: 'Nenhum produto selecionado pra importar.' }, { status: 400 })
  }

  const withinLimit = await checkProductLimit(tenantId, session.user.plan ?? 'STARTER')
  if (!withinLimit) {
    return NextResponse.json({ error: 'Limite de produtos do seu plano atingido. Faça upgrade para importar mais.' }, { status: 403 })
  }

  const existingCategories = await prisma.category.findMany({
    where: { tenantId },
    select: { id: true, name: true, sortOrder: true },
  })
  const byNameLower = new Map(existingCategories.map((c) => [c.name.trim().toLowerCase(), c]))
  let nextCategorySortOrder = existingCategories.length
    ? Math.max(...existingCategories.map((c) => c.sortOrder)) + 1
    : 0

  let createdProducts = 0
  let createdCategories = 0

  await prisma.$transaction(async (tx) => {
    for (const category of categories) {
      if (category.products.length === 0) continue

      const key = category.name.trim().toLowerCase()
      let categoryId = byNameLower.get(key)?.id

      if (!categoryId) {
        const created = await tx.category.create({
          data: { tenantId, name: category.name.trim(), sortOrder: nextCategorySortOrder++ },
          select: { id: true },
        })
        categoryId = created.id
        byNameLower.set(key, { id: created.id, name: category.name, sortOrder: nextCategorySortOrder - 1 })
        createdCategories++
      }

      const lastProduct = await tx.product.findFirst({
        where: { tenantId, categoryId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      })
      let nextProductSortOrder = (lastProduct?.sortOrder ?? -1) + 1

      for (const product of category.products) {
        await tx.product.create({
          data: {
            tenantId,
            categoryId,
            name: product.name.trim(),
            description: product.description || null,
            price: product.price,
            sortOrder: nextProductSortOrder++,
            isActive: true,
          },
        })
        createdProducts++
      }
    }
  })

  await invalidateMenu(tenantId)
  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.PRODUCT_CREATED,
    resource: 'products',
    resourceId: 'bulk-ai-import',
    newValue: { source: 'ai-import', createdCategories, createdProducts },
  })

  return NextResponse.json({ createdCategories, createdProducts })
}
