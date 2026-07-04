// app/api/marketplace/[provider]/sync-now/route.ts
//
// Dispara o polling de eventos para UMA conexão específica, sob demanda.
// Útil para: (1) planos sem cron de alta frequência disponível,
// (2) o lojista clicar "Atualizar agora" no dashboard sem esperar o cron.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { parseProviderParam } from '@/lib/marketplace/provider-param'
import { getMarketplaceClient } from '@/lib/marketplace/registry'
import { getValidAccessToken } from '@/lib/marketplace/token-manager'
import { processMarketplaceOrder } from '@/lib/marketplace/process-order'

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { provider: providerParam } = await params
  const provider = parseProviderParam(providerParam)
  if (!provider) {
    return NextResponse.json({ error: 'Marketplace não suportado' }, { status: 400 })
  }

  const connection = await prisma.marketplaceConnection.findFirst({
    where: { tenantId: session.user.tenantId, provider, status: 'CONNECTED' },
  })
  if (!connection || !connection.externalMerchantId) {
    return NextResponse.json({ error: 'Loja não conectada' }, { status: 404 })
  }

  try {
    const client = getMarketplaceClient(provider)
    const accessToken = await getValidAccessToken(connection)
    const events = await client.pollEvents(accessToken, connection.externalMerchantId)

    let ordersProcessed = 0
    const ackIds: string[] = []

    for (const event of events) {
      try {
        if (event.type === 'ORDER_PLACED') {
          const normalized = await client.getOrder(accessToken, event.externalOrderId)
          if (connection.autoAcceptOrders) {
            await client.confirmOrder(accessToken, event.externalOrderId)
            await processMarketplaceOrder(connection, normalized)
            ordersProcessed += 1
          }
        }
        ackIds.push(event.externalEventId)
      } catch (err) {
        console.error('[marketplace/sync-now] evento com erro:', err)
      }
    }

    if (ackIds.length > 0) {
      await client.acknowledgeEvents(accessToken, ackIds)
    }

    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: { lastPolledAt: new Date(), lastPollingError: null },
    })

    return NextResponse.json({ ok: true, eventsReceived: events.length, ordersProcessed })
  } catch (err) {
    console.error('[marketplace/sync-now]', err)
    return NextResponse.json({ error: 'Falha ao sincronizar' }, { status: 500 })
  }
}
