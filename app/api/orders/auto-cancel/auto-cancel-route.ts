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
    const result = await prisma.order.updateMany({
      where: {
        tenantId,
        paymentStatus: 'PENDING',
        status: {
          notIn: ['DELIVERED', 'CANCELLED', 'REFUNDED'],
        },
        createdAt: { lt: cutoff },
      },
      data: {
        status:       'CANCELLED',
        cancelReason: 'Pagamento não confirmado em 3 horas',
      },
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
