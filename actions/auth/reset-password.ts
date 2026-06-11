'use server'
// actions/auth/reset-password.ts

import { prisma } from '@/lib/db/client'
import { hashPassword } from '@/lib/auth/password'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { z } from 'zod'

const schema = z.object({
  token:           z.string().min(1),
  password:        z.string().min(8, 'Mínimo 8 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
})

export type ResetState = {
  error?: string
  errors?: { password?: string[]; confirmPassword?: string[] }
  success?: boolean
}

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData
): Promise<ResetState> {
  const raw = {
    token:           formData.get('token'),
    password:        formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  // Buscar usuário pelo token
  const user = await prisma.user.findFirst({
    where: { refreshTokenHash: parsed.data.token, isActive: true },
    select: { id: true, tenantId: true },
  })

  if (!user) {
    return { error: 'Link inválido ou expirado. Solicite um novo.' }
  }

  // Atualizar senha e invalidar o token
  const newHash = await hashPassword(parsed.data.password)

  await prisma.user.update({
    where: { id: user.id },
    data:  {
      passwordHash:      newHash,
      refreshTokenHash:  null,              // invalida o token de reset
      passwordChangedAt: new Date(),        // invalida tokens JWT antigos (VULN-10)
      failedLoginCount:  0,                 // resetar contador de falhas
      lockedUntil:       null,
    },
  })

  await auditLog({
    tenantId:   user.tenantId ?? undefined,
    userId:     user.id,
    action:     AuditActions.PASSWORD_CHANGED,
    resource:   'users',
    resourceId: user.id,
    metadata:   { via: 'password-reset' },
  })

  return { success: true }
}
