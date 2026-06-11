'use server'

// actions/products/create-product.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { invalidateMenu } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { checkProductLimit } from '@/lib/db/tenant'
import { z } from 'zod'

const productSchema = z.object({
  categoryId:      z.string().cuid('Categoria inválida'),
  name:            z.string().min(2, 'Nome muito curto').max(100),
  description:     z.string().max(500).optional(),
  price:           z.coerce.number().positive('Preço deve ser positivo'),
  comparePrice:    z.coerce.number().positive().optional().nullable(),
  preparationTime: z.coerce.number().int().positive().optional().nullable(),
  isActive:        z.coerce.boolean().optional(),
  isFeatured:      z.coerce.boolean().optional(),
  isBestSeller:    z.coerce.boolean().optional(),
  ingredients:     z.union([z.string(), z.array(z.string())]).optional(),
  image:           z.string().url().optional().or(z.literal('')),
})

export type ProductFormState = {
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function createProductAction(
  prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const tenantId = session.user.tenantId

  // Verificar limite do plano
  const withinLimit = await checkProductLimit(tenantId, session.user.plan ?? 'STARTER')
  if (!withinLimit) {
    return { error: 'Limite de produtos atingido no plano Starter. Faça upgrade para adicionar mais.' }
  }

  // Parsear ingredientes (pode vir como múltiplos campos com o mesmo nome)
  const rawIngredients = formData.getAll('ingredients') as string[]
  const ingredients = rawIngredients.filter(Boolean)

  const raw = {
    categoryId:      formData.get('categoryId'),
    name:            formData.get('name'),
    description:     formData.get('description') || undefined,
    price:           formData.get('price'),
    comparePrice:    formData.get('comparePrice') || null,
    preparationTime: formData.get('preparationTime') || null,
    isActive:        formData.get('isActive') === 'on' || formData.get('isActive') === 'true',
    isFeatured:      formData.get('isFeatured') === 'on' || formData.get('isFeatured') === 'true',
    isBestSeller:    formData.get('isBestSeller') === 'on' || formData.get('isBestSeller') === 'true',
    image:           formData.get('image') || undefined,
  }

  const parsed = productSchema.safeParse(raw)
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }

  // Verificar que a categoria pertence ao tenant
  const category = await prisma.category.findFirst({
    where: { id: parsed.data.categoryId, tenantId },
  })
  if (!category) return { error: 'Categoria inválida' }

  const product = await prisma.product.create({
    data: {
      tenantId,
      categoryId:      parsed.data.categoryId,
      name:            parsed.data.name,
      description:     parsed.data.description,
      price:           parsed.data.price,
      comparePrice:    parsed.data.comparePrice ?? null,
      preparationTime: parsed.data.preparationTime ?? null,
      isActive:        parsed.data.isActive ?? true,
      isFeatured:      parsed.data.isFeatured ?? false,
      isBestSeller:    parsed.data.isBestSeller ?? false,
      ingredients,
      image:           parsed.data.image || null,
    },
  })

  await invalidateMenu(tenantId)
  revalidatePath('/dashboard/menu/products')

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.PRODUCT_CREATED,
    resource: 'products',
    resourceId: product.id,
    newValue: { name: product.name, price: parsed.data.price },
  })

  redirect('/dashboard/menu/products')
}
