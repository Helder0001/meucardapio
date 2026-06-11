'use server'

// actions/delivery/manage-zones.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { invalidateMenu } from '@/lib/cache/redis'
import { z } from 'zod'

const zoneSchema = z.object({
  bairro:    z.string().min(1).max(100),
  name:      z.string().max(100).optional(),
  fee:       z.coerce.number().min(0),
  freeAbove: z.coerce.number().min(0).optional().nullable(),
  minOrder:  z.coerce.number().min(0).optional().nullable(),
  maxTime:   z.coerce.number().int().positive().optional().nullable(),
})

export async function createDeliveryZoneAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const parsed = zoneSchema.safeParse({
    bairro:    formData.get('bairro'),
    name:      formData.get('name') || undefined,
    fee:       formData.get('fee'),
    freeAbove: formData.get('freeAbove') || null,
    minOrder:  formData.get('minOrder')  || null,
    maxTime:   formData.get('maxTime')   || null,
  })

  if (!parsed.success) return { error: parsed.error.errors[0].message }

  await prisma.deliveryZone.create({
    data: { tenantId: session.user.tenantId, type: 'BAIRRO', ...parsed.data, isActive: true },
  })

  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/delivery')
  return { ok: true }
}

export async function deleteDeliveryZoneAction(zoneId: string) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const zone = await prisma.deliveryZone.findFirst({
    where: { id: zoneId, tenantId: session.user.tenantId },
  })
  if (!zone) return { error: 'Zona não encontrada' }

  await prisma.deliveryZone.delete({ where: { id: zoneId } })
  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/delivery')
  return { ok: true }
}
