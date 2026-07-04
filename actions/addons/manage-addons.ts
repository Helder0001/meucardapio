'use server'
// actions/addons/manage-addons.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { invalidateMenu } from '@/lib/cache/redis'
import { z } from 'zod'

const groupSchema = z.object({
  name:       z.string().min(2).max(50),
  minSelect:  z.coerce.number().int().min(0).default(0),
  maxSelect:  z.coerce.number().int().min(1).default(1),
  isRequired: z.coerce.boolean().optional(),
})

const addonSchema = z.object({
  name:  z.string().min(1).max(100),
  price: z.coerce.number().min(0).default(0),
})

// ── Grupo ─────────────────────────────────────────────────

export async function createAddonGroupAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) return { error: 'Sem permissão' }

  const parsed = groupSchema.safeParse({
    name:       formData.get('name'),
    minSelect:  formData.get('minSelect'),
    maxSelect:  formData.get('maxSelect'),
    isRequired: formData.get('isRequired') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  await prisma.addonGroup.create({
    data: { tenantId: session.user.tenantId, ...parsed.data },
  })

  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/menu/addons')
  return { ok: true }
}

export async function updateAddonGroupAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) return { error: 'Sem permissão' }

  const groupId = formData.get('groupId') as string
  if (!groupId) return { error: 'ID inválido' }

  const group = await prisma.addonGroup.findFirst({
    where: { id: groupId, tenantId: session.user.tenantId },
  })
  if (!group) return { error: 'Grupo não encontrado' }

  const parsed = groupSchema.safeParse({
    name:       formData.get('name'),
    minSelect:  formData.get('minSelect'),
    maxSelect:  formData.get('maxSelect'),
    isRequired: formData.get('isRequired') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  await prisma.addonGroup.update({ where: { id: groupId }, data: parsed.data })

  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/menu/addons')
  return { ok: true }
}

export async function deleteAddonGroupAction(groupId: string) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) return { error: 'Sem permissão' }

  const group = await prisma.addonGroup.findFirst({
    where:  { id: groupId, tenantId: session.user.tenantId },
    select: { id: true, _count: { select: { products: true } } },
  })
  if (!group)                    return { error: 'Grupo não encontrado' }
  if (group._count.products > 0) return { error: 'Desvincule dos produtos antes de excluir' }

  // Deletar addons filhos + o grupo
  await prisma.$transaction([
    prisma.addon.deleteMany({ where: { addonGroupId: groupId } }),
    prisma.addonGroup.delete({ where: { id: groupId } }),
  ])

  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/menu/addons')
  return { ok: true }
}

// ── Item (Addon) ──────────────────────────────────────────

export async function createAddonAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) return { error: 'Sem permissão' }

  const groupId = formData.get('groupId') as string

  // Verificar que o grupo pertence ao tenant
  const group = await prisma.addonGroup.findFirst({
    where: { id: groupId, tenantId: session.user.tenantId },
    select: { id: true, _count: { select: { addons: true } } },
  })
  if (!group) return { error: 'Grupo não encontrado' }

  const parsed = addonSchema.safeParse({
    name:  formData.get('name'),
    price: formData.get('price'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  await prisma.addon.create({
    data: {
      tenantId:    session.user.tenantId,
      addonGroupId: groupId,
      name:        parsed.data.name,
      price:       parsed.data.price,
      sortOrder:   group._count.addons,
      isActive:    true,
    },
  })

  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/menu/addons')
  return { ok: true }
}

export async function updateAddonAction(
  addonId: string,
  data: { name?: string; price?: number; isActive?: boolean }
) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) return { error: 'Sem permissão' }

  const addon = await prisma.addon.findFirst({
    where: { id: addonId, tenantId: session.user.tenantId },
  })
  if (!addon) return { error: 'Item não encontrado' }

  const updateData: Record<string, unknown> = {}
  if (data.name     !== undefined) updateData.name     = data.name.trim().slice(0, 100)
  if (data.price    !== undefined) updateData.price    = Math.max(0, data.price)
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  await prisma.addon.update({ where: { id: addonId }, data: updateData })

  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/menu/addons')
  return { ok: true }
}

export async function deleteAddonAction(addonId: string) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) return { error: 'Sem permissão' }

  const addon = await prisma.addon.findFirst({
    where: { id: addonId, tenantId: session.user.tenantId },
  })
  if (!addon) return { error: 'Item não encontrado' }

  await prisma.addon.delete({ where: { id: addonId } })

  await invalidateMenu(session.user.tenantId)
  revalidatePath('/dashboard/menu/addons')
  return { ok: true }
}
