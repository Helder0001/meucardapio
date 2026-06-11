'use server'
// actions/categories/manage-categories.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { invalidateMenu } from '@/lib/cache/redis'
import { z } from 'zod'

const categorySchema = z.object({
  name:        z.string().min(2, 'Nome muito curto').max(50),
  description: z.string().max(200).optional(),
  image:       z.string().url().optional().or(z.literal('')),
})

export type CategoryState = { error?: string; success?: boolean }

export async function createCategoryAction(
  _prev: CategoryState,
  formData: FormData
): Promise<CategoryState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const parsed = categorySchema.safeParse({
    name:        formData.get('name'),
    description: formData.get('description') || undefined,
    image:       formData.get('image') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  // Verificar limite do plano Starter (pode limitar categorias futuramente)
  const count = await prisma.category.count({
    where: { tenantId: session.user.tenantId },
  })

  // Calcular próxima sortOrder
  const maxOrder = await prisma.category.findFirst({
    where:   { tenantId: session.user.tenantId },
    orderBy: { sortOrder: 'desc' },
    select:  { sortOrder: true },
  })

  await prisma.category.create({
    data: {
      tenantId:    session.user.tenantId,
      name:        parsed.data.name,
      description: parsed.data.description,
      image:       parsed.data.image || null,
      sortOrder:   (maxOrder?.sortOrder ?? 0) + 1,
      isActive:    true,
    },
  })

  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/menu/categories')
  return { success: true }
}

export async function updateCategoryAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const categoryId = formData.get('categoryId') as string
  if (!categoryId) return { error: 'ID inválido' }

  // Verificar propriedade (IDOR prevention)
  const category = await prisma.category.findFirst({
    where: { id: categoryId, tenantId: session.user.tenantId },
  })
  if (!category) return { error: 'Categoria não encontrada' }

  const updateData: Record<string, unknown> = {}

  const name     = formData.get('name') as string
  const isActive = formData.get('isActive') as string

  if (name)        updateData.name     = name.trim().slice(0, 50)
  if (isActive !== null && isActive !== undefined) {
    updateData.isActive = isActive === 'true'
  }

  const description = formData.get('description')
  if (description !== null) updateData.description = (description as string) || null

  const image = formData.get('image')
  if (image !== null) updateData.image = (image as string) || null

  await prisma.category.update({
    where: { id: categoryId },
    data:  updateData,
  })

  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/menu/categories')
  return { ok: true }
}

export async function deleteCategoryAction(categoryId: string) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  // Verificar propriedade
  const category = await prisma.category.findFirst({
    where:  { id: categoryId, tenantId: session.user.tenantId },
    select: { id: true, _count: { select: { products: true } } },
  })
  if (!category) return { error: 'Categoria não encontrada' }

  if (category._count.products > 0) {
    return { error: 'Mova os produtos desta categoria antes de excluir.' }
  }

  await prisma.category.delete({ where: { id: categoryId } })

  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/menu/categories')
  return { ok: true }
}
