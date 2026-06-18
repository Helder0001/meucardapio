'use server'
// actions/pdv/manage-pdv.ts
//
// NOVO: ações de servidor para o módulo Multi-PDV.
// Permite criar, editar, ativar/desativar pontos de venda (PDV) e
// vincular usuários (atendentes/garçons) a um PDV específico.

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { z } from 'zod'

const PLAN_ORDER = { STARTER: 0, PRO: 1, PREMIUM: 2 } as const

const pdvSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(60),
  type: z.enum(['STORE', 'DELIVERY', 'KIOSK']).default('STORE'),
  address: z.string().max(200).optional(),
})

export type PdvState = { error?: string; success?: boolean }

async function requireManager() {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' as const }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return { error: 'Apenas administradores e gerentes podem gerenciar PDVs.' as const }
  }
  // CORREÇÃO: extrai tenantId já validado como string (não-nulo) para evitar
  // erro de build "Type 'string | null' is not assignable to type 'string | undefined'"
  // ao passar tenantId (string | null) para o Prisma.
  return { session, tenantId: session.user.tenantId as string }
}

export async function createPdvAction(_prev: PdvState, formData: FormData): Promise<PdvState> {
  const check = await requireManager()
  if ('error' in check) return { error: check.error }
  const { session, tenantId } = check

  // Multi-PDV é um recurso PRO/PREMIUM
  const plan = session.user.plan ?? 'STARTER'
  if (PLAN_ORDER[plan as keyof typeof PLAN_ORDER] < PLAN_ORDER.PRO) {
    return { error: 'Multi-PDV disponível a partir do plano Pro. Faça upgrade do seu plano.' }
  }

  const parsed = pdvSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type') || 'STORE',
    address: formData.get('address') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  await prisma.pDV.create({
    data: {
      tenantId,
      name: parsed.data.name,
      type: parsed.data.type,
      address: parsed.data.address ? { full: parsed.data.address } : undefined,
      isActive: true,
    },
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.USER_UPDATED,
    resource: 'pdv',
    newValue: { name: parsed.data.name, type: parsed.data.type },
  })

  revalidatePath('/dashboard/pdv')
  return { success: true }
}

export async function updatePdvAction(formData: FormData): Promise<PdvState> {
  const check = await requireManager()
  if ('error' in check) return { error: check.error }
  const { tenantId } = check

  const pdvId = formData.get('pdvId') as string
  if (!pdvId) return { error: 'ID inválido' }

  const pdv = await prisma.pDV.findFirst({
    where: { id: pdvId, tenantId },
  })
  if (!pdv) return { error: 'PDV não encontrado' }

  const parsed = pdvSchema.partial().safeParse({
    name: formData.get('name') || undefined,
    type: formData.get('type') || undefined,
    address: formData.get('address') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const isActiveRaw = formData.get('isActive')

  await prisma.pDV.update({
    where: { id: pdvId },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(parsed.data.address ? { address: { full: parsed.data.address } } : {}),
      ...(isActiveRaw !== null ? { isActive: isActiveRaw === 'true' } : {}),
    },
  })

  revalidatePath('/dashboard/pdv')
  return { success: true }
}

export async function deletePdvAction(pdvId: string): Promise<PdvState> {
  const check = await requireManager()
  if ('error' in check) return { error: check.error }
  const { tenantId } = check

  const pdv = await prisma.pDV.findFirst({
    where: { id: pdvId, tenantId },
    include: { _count: { select: { orders: true, tables: true } } },
  })
  if (!pdv) return { error: 'PDV não encontrado' }

  if (pdv._count.orders > 0 || pdv._count.tables > 0) {
    return { error: 'Este PDV possui pedidos ou mesas vinculadas. Desative-o em vez de excluir.' }
  }

  await prisma.pDV.delete({ where: { id: pdvId } })
  revalidatePath('/dashboard/pdv')
  return { success: true }
}

// Vincula/desvincula um usuário (atendente/garçom) a um PDV
export async function setPdvUserAction(pdvId: string, userId: string, linked: boolean): Promise<PdvState> {
  const check = await requireManager()
  if ('error' in check) return { error: check.error }
  const { tenantId } = check

  const pdv = await prisma.pDV.findFirst({ where: { id: pdvId, tenantId } })
  if (!pdv) return { error: 'PDV não encontrado' }

  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } })
  if (!user) return { error: 'Usuário não encontrado' }

  if (linked) {
    await prisma.pDVUser.upsert({
      where: { pdvId_userId: { pdvId, userId } },
      create: { pdvId, userId },
      update: {},
    })
  } else {
    await prisma.pDVUser.deleteMany({ where: { pdvId, userId } })
  }

  revalidatePath('/dashboard/pdv')
  return { success: true }
}
