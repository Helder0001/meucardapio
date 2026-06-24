'use server'

// actions/users/manage-users.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { hashPassword } from '@/lib/auth/password'
import { checkUserLimit } from '@/lib/db/tenant'
import { revalidatePath } from 'next/cache'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { z } from 'zod'

const createSchema = z.object({
  name:     z.string().min(2).max(100),
  email:    z.string().email().toLowerCase(),
  role:     z.enum(['MANAGER', 'ATTENDANT', 'STAFF', 'DELIVERY_PERSON']),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
})

export type UserFormState = { error?: string; success?: boolean }

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(session.user.role)) {
    return { error: 'Sem permissão' }
  }

  const tenantId = session.user.tenantId
  const plan     = session.user.plan ?? 'STARTER'

  // Verificar limite do plano
  const canAdd = await checkUserLimit(tenantId, plan)
  if (!canAdd) return { error: 'Limite de usuários do plano atingido' }

  const parsed = createSchema.safeParse({
    name:     formData.get('name'),
    email:    formData.get('email'),
    role:     formData.get('role'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  // Verificar email duplicado no tenant
  const exists = await prisma.user.findFirst({
    where: { email: parsed.data.email, tenantId },
  })
  if (exists) return { error: 'Este email já está em uso' }

  const passwordHash = await hashPassword(parsed.data.password)

  const user = await prisma.user.create({
    data: {
      tenantId,
      name:         parsed.data.name,
      email:        parsed.data.email,
      role:         parsed.data.role,
      passwordHash,
      isActive:     true,
    },
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.USER_CREATED,
    resource: 'users',
    resourceId: user.id,
    newValue: { name: user.name, email: user.email, role: user.role },
  })

  revalidatePath('/dashboard/settings/users')
  return { success: true }
}

export async function deactivateUserAction(userId: string): Promise<{ error?: string; ok?: boolean }> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(session.user.role)) {
    return { error: 'Sem permissão' }
  }

  // Não pode desativar a si mesmo
  if (userId === session.user.id) return { error: 'Você não pode desativar sua própria conta' }

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId },
  })
  if (!user) return { error: 'Usuário não encontrado' }

  await prisma.user.update({
    where: { id: userId },
    data:  { isActive: false, refreshTokenHash: null },
  })

  await auditLog({
    tenantId:   session.user.tenantId,
    userId:     session.user.id,
    action:     AuditActions.USER_DEACTIVATED,
    resource:   'users',
    resourceId: userId,
  })

  revalidatePath('/dashboard/settings/users')
  return { ok: true }
}
