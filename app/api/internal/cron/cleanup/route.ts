// app/api/internal/cron/cleanup/route.ts
// Limpeza diária de dados temporários

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db/client'
import { restockCancelledOrder, revalidateStorefrontForTenant } from '@/lib/utils/stock'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { notifyOrderStatus } from '@/lib/messaging/evolution'
import { isValidCronSecretHeader } from '@/lib/security/cron-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PENDING_PAYMENT_TIMEOUT_MS = 2 * 60 * 60 * 1000 // 2 horas

export async function GET(request: Request) {
  // VULN-BAIXA-07 CORRIGIDO: comparação direta (!==) trocada por
  // isValidCronSecretHeader(), que usa crypto.timingSafeEqual — mesmo
  // padrão agora usado nos 4 endpoints de cron.
  if (!isValidCronSecretHeader(request)) {
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

  // 3. Cancelar pedidos PENDING sem pagamento há mais de 2h.
  // Cada pedido é cancelado em sua própria transação (estoque + status
  // juntos, atomicamente), em vez de um updateMany solto — porque
  // precisamos estornar o estoque debitado na criação do pedido, e
  // updateMany não permite rodar lógica adicional por linha.
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      paymentStatus: 'PENDING',
      createdAt: { lt: new Date(Date.now() - PENDING_PAYMENT_TIMEOUT_MS) },
    },
    select: { id: true, tenantId: true, orderNumber: true },
  })

  let cancelledCount = 0
  for (const order of expiredOrders) {
    try {
      let affectedProductIds: string[] = []
      const didCancel = await prisma.$transaction(async (tx) => {
        // Só cancela se ainda estiver PENDING no momento exato da transação
        // (evita corrida com o webhook do MP ou uma confirmação manual
        // que tenha acontecido entre o findMany acima e agora).
        const updated = await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING', paymentStatus: 'PENDING' },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: 'Cancelamento automático por falta de pagamento (2h)',
          },
        })
        if (updated.count === 0) return false // outra rotina já tratou este pedido

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: 'CANCELLED',
            notes: 'Cancelamento automático: pagamento pendente há mais de 2 horas',
          },
        })

        // Devolve ao estoque tudo que foi debitado na criação do pedido
        const result = await restockCancelledOrder(tx, { tenantId: order.tenantId, orderId: order.id })
        affectedProductIds = result.affectedProductIds
        return true
      })

      if (!didCancel) continue
      cancelledCount += 1

      if (affectedProductIds.length > 0) {
        await revalidateStorefrontForTenant(order.tenantId)
      }

      // Efeitos colaterais não-críticos rodam após a transação confirmar
      after(async () => {
        try {
          await publishOrderEvent(order.tenantId, {
            type: 'ORDER_UPDATED',
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: 'CANCELLED',
          })
          await auditLog({
            tenantId: order.tenantId,
            action: AuditActions.ORDER_CANCELLED,
            resource: 'orders',
            resourceId: order.id,
            newValue: { status: 'CANCELLED', reason: 'Falta de pagamento (2h) — cancelamento automático' },
          })
          await notifyOrderStatus(order.id, 'CANCELLED')
        } catch (err) {
          console.error('[cron/cleanup] Erro em efeito colateral pós-cancelamento:', err)
        }
      })
    } catch (err) {
      console.error('[cron/cleanup] Falha ao cancelar pedido expirado:', order.id, err)
      // Continua para os próximos pedidos — uma falha isolada não deve
      // interromper a limpeza dos demais.
    }
  }
  results.cancelledOrders = cancelledCount

  console.log('[cron/cleanup]', results)
  return NextResponse.json({ ok: true, ...results })
}
