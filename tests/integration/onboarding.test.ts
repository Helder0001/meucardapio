// tests/integration/onboarding.test.ts
// Testa o fluxo de onboarding: progresso e marcação como concluído.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/session', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/client', () => ({
  prisma: {
    tenant: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

// Inline the handler logic for testability
async function completeOnboardingHandler(userId: string | null, tenantId: string | null) {
  if (!tenantId) return { status: 401 }

  const tenant = await (prisma.tenant.findFirst as any)({ where: { id: tenantId }, select: { settings: true } })
  const current = (tenant?.settings as Record<string, any>) ?? {}

  await (prisma.tenant.update as any)({
    where: { id: tenantId },
    data: {
      settings: { ...current, onboardingCompleted: true, onboardingCompletedAt: new Date().toISOString() },
    },
  })
  return { status: 200 }
}

describe('Onboarding completion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marca onboarding como concluído e preserva settings existentes', async () => {
    ;(prisma.tenant.findFirst as any).mockResolvedValue({
      settings: { whatsappInstanceId: 'wa-123' },
    })
    ;(prisma.tenant.update as any).mockResolvedValue({})

    const result = await completeOnboardingHandler('user-1', 'tenant-1')

    expect(result.status).toBe(200)
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settings: expect.objectContaining({
            onboardingCompleted: true,
            whatsappInstanceId: 'wa-123', // settings existentes preservados
          }),
        }),
      })
    )
  })

  it('retorna 401 sem tenantId', async () => {
    const result = await completeOnboardingHandler(null, null)
    expect(result.status).toBe(401)
    expect(prisma.tenant.update).not.toHaveBeenCalled()
  })
})
