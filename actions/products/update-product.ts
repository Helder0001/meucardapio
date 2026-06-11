'use server'
// actions/products/update-product.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { invalidateMenu } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { z } from 'zod'

const schema = z.object({
  productId:      z.string().cuid(),
  name:           z.string().min(2).max(100),
  description:    z.string().max(500).optional(),
  price:          z.coerce.number().positive(),
  comparePrice:   z.coerce.number().positive().optional().nullable(),
  categoryId:     z.string().cuid(),
  preparationTime:z.coerce.number().int().positive().optional().nullable(),
  isActive:       z.string().transform((v) => v === 'true'),
  isFeatured:     z.string().transform((v) => v === 'true'),
  isBestSeller:   z.string().transform((v) => v === 'true'),
  image:          z.string().url().optional().or(z.literal('')),
})

export async function updateProductAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const tenantId = session.user.tenantId

  const raw = {
    productId:       formData.get('productId'),
    name:            formData.get('name'),
    description:     formData.get('description') || undefined,
    price:           formData.get('price'),
    comparePrice:    formData.get('comparePrice') || null,
    categoryId:      formData.get('categoryId'),
    preparationTime: formData.get('preparationTime') || null,
    isActive:        formData.get('isActive') ?? 'false',
    isFeatured:      formData.get('isFeatured') ?? 'false',
    isBestSeller:    formData.get('isBestSeller') ?? 'false',
    image:           formData.get('image') || undefined,
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  // Verificar que o produto pertence ao tenant (IDOR prevention)
  const existing = await prisma.product.findFirst({
    where: { id: parsed.data.productId, tenantId },
    select: { id: true, price: true, name: true },
  })
  if (!existing) return { error: 'Produto não encontrado' }

  const ingredients    = formData.getAll('ingredients') as string[]
  const tags           = formData.getAll('tags') as string[]
  const addonGroupIds  = formData.getAll('addonGroupIds') as string[]

  // Verificar categoria do tenant
  const category = await prisma.category.findFirst({
    where: { id: parsed.data.categoryId, tenantId },
  })
  if (!category) return { error: 'Categoria inválida' }

  const priceChanged = Number(existing.price) !== parsed.data.price

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: parsed.data.productId },
      data: {
        name:            parsed.data.name,
        description:     parsed.data.description,
        price:           parsed.data.price,
        comparePrice:    parsed.data.comparePrice,
        categoryId:      parsed.data.categoryId,
        preparationTime: parsed.data.preparationTime,
        isActive:        parsed.data.isActive,
        isFeatured:      parsed.data.isFeatured,
        isBestSeller:    parsed.data.isBestSeller,
        image:           parsed.data.image || null,
        ingredients:     ingredients.filter(Boolean),
        tags:            tags.filter(Boolean),
      },
    })

    // Atualizar grupos de adicionais
    await tx.productAddonGroup.deleteMany({ where: { productId: parsed.data.productId } })
    if (addonGroupIds.length > 0) {
      await tx.productAddonGroup.createMany({
        data: addonGroupIds.map((addonGroupId) => ({
          productId:   parsed.data.productId,
          addonGroupId,
        })),
      })
    }
  })

  await invalidateMenu(tenantId)
  revalidatePath('/dashboard/menu/products')

  // Audit log especial para mudança de preço
  if (priceChanged) {
    await auditLog({
      tenantId,
      userId:     session.user.id,
      action:     AuditActions.PRODUCT_PRICE_CHANGED,
      resource:   'products',
      resourceId: parsed.data.productId,
      oldValue:   { price: Number(existing.price) },
      newValue:   { price: parsed.data.price },
    })
  } else {
    await auditLog({
      tenantId,
      userId:     session.user.id,
      action:     AuditActions.PRODUCT_UPDATED,
      resource:   'products',
      resourceId: parsed.data.productId,
    })
  }

  return { ok: true }
}
