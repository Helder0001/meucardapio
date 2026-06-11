// app/api/internal/cron/subscription-check/route.ts
// Verifica assinaturas vencidas e suspende tenants inadimplentes

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function GET(request: Request) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, number> = {}

  // 1. Trials expirados → mudar para SUSPENDED
  const { count: expiredTrials } = await prisma.tenant.updateMany({
    where: {
      subscriptionStatus: 'TRIAL',
      trialEndsAt: { lt: new Date() },
    },
    data: { subscriptionStatus: 'SUSPENDED' },
  })
  results.expiredTrials = expiredTrials

  // 2. Assinaturas PAST_DUE há mais de 7 dias → SUSPENDED
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const pastDueSubscriptions = await prisma.subscription.findMany({
    where: {
      status: 'PAST_DUE',
      updatedAt: { lt: sevenDaysAgo },
    },
    select: { tenantId: true },
  })

  if (pastDueSubscriptions.length > 0) {
    const { count: suspended } = await prisma.tenant.updateMany({
      where: {
        id: { in: pastDueSubscriptions.map((s) => s.tenantId) },
      },
      data: { subscriptionStatus: 'SUSPENDED' },
    })
    results.suspendedForNonPayment = suspended
  }

  // 3. Notificar tenants com trial expirando em 2 dias (TODO: enviar email)
  const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  const expiringTrials = await prisma.tenant.count({
    where: {
      subscriptionStatus: 'TRIAL',
      trialEndsAt: { lte: twoDaysFromNow, gte: new Date() },
    },
  })
  results.expiringTrialsIn2Days = expiringTrials

  console.log('[cron/subscription-check]', results)
  return NextResponse.json({ ok: true, ...results })
}
