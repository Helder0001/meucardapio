'use server'

// actions/loyalty/save-loyalty.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const loyaltySchema = z.object({
  pointsPerReal: z.coerce.number().positive(),
  redeemEvery:   z.coerce.number().int().positive(),
  redeemValue:   z.coerce.number().positive(),
  isActive:      z.coerce.boolean().optional(),
})

const cashbackSchema = z.object({
  percentage:   z.coerce.number().min(0).max(50),
  validityDays: z.coerce.number().int().positive(),
  isActive:     z.coerce.boolean().optional(),
})

export type LoyaltyState = { error?: string; success?: boolean }

export async function saveLoyaltyAction(
  _prev: LoyaltyState,
  formData: FormData
): Promise<LoyaltyState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const tenantId = session.user.tenantId
  const module   = formData.get('module') as string

  if (module === 'loyalty') {
    const parsed = loyaltySchema.safeParse({
      pointsPerReal: formData.get('pointsPerReal'),
      redeemEvery:   formData.get('redeemEvery'),
      redeemValue:   formData.get('redeemValue'),
      isActive:      formData.get('isActive') === 'on',
    })
    if (!parsed.success) return { error: parsed.error.errors[0].message }

    await prisma.loyaltyConfig.upsert({
      where:  { tenantId },
      update: parsed.data,
      create: { tenantId, ...parsed.data },
    })
  }

  if (module === 'cashback') {
    const parsed = cashbackSchema.safeParse({
      percentage:   formData.get('percentage'),
      validityDays: formData.get('validityDays'),
      isActive:     formData.get('isActive') === 'on',
    })
    if (!parsed.success) return { error: parsed.error.errors[0].message }

    await prisma.cashbackConfig.upsert({
      where:  { tenantId },
      update: parsed.data,
      create: { tenantId, ...parsed.data },
    })
  }

  revalidatePath('/dashboard/loyalty')
  return { success: true }
}
