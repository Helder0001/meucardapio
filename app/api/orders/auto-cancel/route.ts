// app/api/orders/auto-cancel/route.ts
//
// Cancela pedidos com pagamento PENDING há mais de 3 horas.
// Chamado pelo kanban e pelo middleware de autenticação ao carregar o dashboard.
// Solução para Vercel gratuito (sem cron jobs frequentes).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  const cutoff   = new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 horas atrás

  try {
    const ordersToCancel = await prisma.order.findMany({
      where: {
        tenantId,
        paymentStatus: 'PENDING',
        status: {
          notIn: ['DELIVERED', 'CANCELLED', 'REFUNDED'],
        },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    })

    if (ordersToCancel.length === 0) {
      return NextResponse.json({ cancelled: 0 })
    }

    const orderIds = ordersToCancel.map((o) => o.id)

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: {
          status:        'CANCELLED',
          paymentStatus: 'FAILED',
          cancelReason:  'Pagamento não confirmado em 3 horas',
        },
      })

      // CORREÇÃO: sem isso, o(s) Payment ficavam presos em PENDING para
      // sempre e a tela do pedido continuava mostrando "Aguardando
      // confirmação" mesmo com o pedido já cancelado.
      await tx.payment.updateMany({
        where: { orderId: { in: orderIds }, status: 'PENDING' },
        data: { status: 'FAILED', failedAt: new Date() },
      })

      return updated
    })

    if (result.count > 0) {
      console.log(`[auto-cancel] tenant=${tenantId} cancelou ${result.count} pedido(s)`)
    }

    return NextResponse.json({ cancelled: result.count })
  } catch (err) {
    console.error('[auto-cancel]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
