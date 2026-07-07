// app/api/internal/cron/subscription-check/route.ts
// Verifica assinaturas vencidas e suspende tenants inadimplentes

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import crypto from 'crypto'

function timingSafeEqualStr(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  } catch {
    return false
  }
}

// A Vercel envia o CRON_SECRET automaticamente como
// "Authorization: Bearer <CRON_SECRET>" para crons definidos em vercel.json
// — é assim que ela autentica execuções agendadas. Mantemos também o header
// legado "x-cron-secret" para chamadas manuais (curl/monitoramento externo),
// no mesmo padrão já usado em /api/internal/cron/cleanup.
function isValidCronSecretHeader(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false

  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const legacySecret = request.headers.get('x-cron-secret')

  if (bearerToken && timingSafeEqualStr(expected, bearerToken)) return true
  if (legacySecret && timingSafeEqualStr(expected, legacySecret)) return true
  return false
}

export async function GET(request: Request) {
  if (!isValidCronSecretHeader(request)) {
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
