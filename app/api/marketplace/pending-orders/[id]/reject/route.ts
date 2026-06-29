// app/api/marketplace/pending-orders/[id]/reject/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { getMarketplaceClient } from '@/lib/marketplace/registry'
import { getValidAccessToken } from '@/lib/marketplace/token-manager'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Estabelecimento sem capacidade no momento'

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

    await client.cancelOrder(accessToken, pendingOrder.externalOrderId, reason)

    await prisma.marketplaceOrder.update({
      where: { id: pendingOrder.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[marketplace/pending-orders/reject]', err)
    return NextResponse.json({ error: 'Falha ao recusar pedido na plataforma de origem' }, { status: 500 })
  }
}
