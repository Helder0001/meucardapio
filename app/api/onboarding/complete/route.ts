// app/api/onboarding/complete/route.ts
// Marca o onboarding como concluído salvando flag nas settings do tenant.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: session.user.tenantId },
    select: { settings: true },
  })

  const current = (tenant?.settings as Record<string, any>) ?? {}

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: {
      settings: {
        ...current,
        onboardingCompleted: true,
        onboardingCompletedAt: new Date().toISOString(),
      },
    },
  })

  return NextResponse.json({ ok: true })
}
