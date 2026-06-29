// app/api/marketplace/pending-orders/route.ts
//
// Lista pedidos recebidos do iFood/99Food que ainda não foram confirmados
// (status RECEIVED) — aparecem aqui quando autoAcceptOrders está desligado,
// para o lojista confirmar ou recusar manualmente dentro do prazo da
// plataforma de origem.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pending = await prisma.marketplaceOrder.findMany({
    where: { tenantId: session.user.tenantId, status: 'RECEIVED' },
    orderBy: { receivedAt: 'asc' },
    select: {
      id: true,
      provider: true,
      externalOrderId: true,
      externalDisplayId: true,
      grossAmount: true,
      receivedAt: true,
      rawPayload: true,
    },
  })

  return NextResponse.json({ pending })
}
