// app/api/marketplace/pending-orders/[id]/confirm/route.ts
//
// Confirma manualmente um pedido recebido do marketplace que estava
// aguardando decisão do lojista (autoAcceptOrders desligado).
// IMPORTANTE: respeitar o prazo da plataforma de origem (iFood: 8 minutos)
// — passado esse prazo a confirmação pode ser rejeitada pela API.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { getMarketplaceClient } from '@/lib/marketplace/registry'
import { getValidAccessToken } from '@/lib/marketplace/token-manager'
import { processMarketplaceOrder } from '@/lib/marketplace/process-order'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const pendingOrder = await prisma.marketplaceOrder.findFirst({
    where: { id, tenantId: session.user.tenantId, status: 'RECEIVED' },
    include: { connection: true },
  })
  if (!pendingOrder) {
    return NextResponse.json({ error: 'Pedido não encontrado ou já processado' }, { status: 404 })
  }

  try {
    const client = getMarketplaceClient(pendingOrder.provider)
    const accessToken = await getValidAccessToken(pendingOrder.connection)

    await client.confirmOrder(accessToken, pendingOrder.externalOrderId)
    const normalized = await client.getOrder(accessToken, pendingOrder.externalOrderId)
    const result = await processMarketplaceOrder(pendingOrder.connection, normalized)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }

    return NextResponse.json({ ok: true, orderId: result.orderId })
  } catch (err) {
    console.error('[marketplace/pending-orders/confirm]', err)
    return NextResponse.json({ error: 'Falha ao confirmar pedido na plataforma de origem' }, { status: 500 })
  }
}
