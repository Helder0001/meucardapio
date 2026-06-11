// app/api/internal/cron/cleanup/route.ts
// Limpeza diária de dados temporários

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  // Verificar segredo do cron
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, number> = {}

  // 1. Remover print jobs com mais de 7 dias
  const { count: deletedJobs } = await prisma.printJob.deleteMany({
    where: {
      createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      status: { in: ['PRINTED', 'FAILED'] },
    },
  })
  results.deletedPrintJobs = deletedJobs

  // 2. Limpar OTPs expirados (já expiram no Redis, mas limpar do DB também)
  const { count: clearedOtps } = await prisma.customer.updateMany({
    where: {
      otpExpiresAt: { lt: new Date() },
      otpCode: { not: null },
    },
    data: { otpCode: null, otpExpiresAt: null, otpAttempts: 0 },
  })
  results.clearedOtps = clearedOtps

  // 3. Marcar pedidos PENDING sem pagamento há mais de 2h como CANCELLED
  const { count: cancelledOrders } = await prisma.order.updateMany({
    where: {
      status: 'PENDING',
      paymentStatus: 'PENDING',
      createdAt: { lt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: 'Cancelamento automático por falta de pagamento',
    },
  })
  results.cancelledOrders = cancelledOrders

  console.log('[cron/cleanup]', results)
  return NextResponse.json({ ok: true, ...results })
}
