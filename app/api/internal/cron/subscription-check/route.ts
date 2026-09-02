// app/api/internal/cron/subscription-check/route.ts
// Verifica assinaturas vencidas e suspende tenants inadimplentes

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { isValidCronSecretHeader } from '@/lib/security/cron-auth'

// A implementação de isValidCronSecretHeader() (com crypto.timingSafeEqual)
// que vivia só aqui foi extraída pra lib/security/cron-auth.ts e agora é
// compartilhada pelos 4 endpoints de cron — os outros 3 usavam uma
// comparação `!==` não constant-time (ver VULN-BAIXA-07 no relatório de
// auditoria).

export async function GET(request: Request) {
  if (!isValidCronSecretHeader(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, number> = {}

  // 0. Cancelamentos solicitados (cancelledAt setado) cujo período já pago
  // (currentPeriodEnd) já passou → agora sim finaliza: bloqueia o acesso.
  // Antes disso, o tenant continua ACTIVE de propósito (cancelar não corta
  // o acesso na hora, só impede a próxima cobrança — ver
  // actions/billing/cancel-subscription.ts).
  const endedCancellations = await prisma.subscription.findMany({
    where: {
      cancelledAt: { not: null },
      status: { not: 'CANCELLED' },
      currentPeriodEnd: { lt: new Date() },
    },
    select: { id: true, tenantId: true },
  })

  if (endedCancellations.length > 0) {
    await prisma.subscription.updateMany({
      where: { id: { in: endedCancellations.map((s) => s.id) } },
      data: { status: 'CANCELLED' },
    })
    await prisma.tenant.updateMany({
      where: { id: { in: endedCancellations.map((s) => s.tenantId) } },
      data: { subscriptionStatus: 'CANCELLED' },
    })
  }
  results.cancellationsFinalized = endedCancellations.length

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
