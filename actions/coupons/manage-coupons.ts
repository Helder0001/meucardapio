'use server'

// actions/coupons/manage-coupons.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const couponSchema = z.object({
  code:          z.string().min(3).max(30).toUpperCase().regex(/^[A-Z0-9]+$/, 'Apenas letras e números'),
  description:   z.string().max(100).optional(),
  type:          z.enum(['PERCENTAGE', 'FIXED', 'FREE_DELIVERY']),
  value:         z.coerce.number().min(0).default(0),
  minOrderValue: z.coerce.number().min(0).optional().nullable(),
  usageLimit:    z.coerce.number().int().positive().optional().nullable(),
  expiresAt:     z.string().optional().nullable(),
})

export type CouponFormState = { error?: string; success?: boolean }

export async function createCouponAction(
  _prev: CouponFormState,
  formData: FormData
): Promise<CouponFormState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return { error: 'Sem permissão' }
  }

  const tenantId = session.user.tenantId

  const raw = {
    code:          formData.get('code'),
    description:   formData.get('description') || undefined,
    type:          formData.get('type'),
    value:         formData.get('value') || '0',
    minOrderValue: formData.get('minOrderValue') || null,
    usageLimit:    formData.get('usageLimit') || null,
    expiresAt:     formData.get('expiresAt') || null,
  }

  const parsed = couponSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  // Verificar código duplicado no tenant
  const exists = await prisma.coupon.findFirst({
    where: { code: parsed.data.code, tenantId },
  })
  if (exists) return { error: `O código "${parsed.data.code}" já existe` }

  await prisma.coupon.create({
    data: {
      tenantId,
      code:          parsed.data.code,
      description:   parsed.data.description,
      type:          parsed.data.type,
      value:         parsed.data.value,
      minOrderValue: parsed.data.minOrderValue ?? null,
      usageLimit:    parsed.data.usageLimit ?? null,
      expiresAt:     parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      isActive:      true,
    },
  })

  revalidatePath('/dashboard/coupons')
  return { success: true }
}

export async function toggleCouponAction(couponId: string, active: boolean) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return { error: 'Sem permissão' }
  }

  const coupon = await prisma.coupon.findFirst({
    where: { id: couponId, tenantId: session.user.tenantId },
  })
  if (!coupon) return { error: 'Cupom não encontrado' }

  await prisma.coupon.update({ where: { id: couponId }, data: { isActive: active } })
  revalidatePath('/dashboard/coupons')
  return { ok: true }
}
