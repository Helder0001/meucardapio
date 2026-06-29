// lib/marketplace/poll-events.ts
//
// Orquestra o polling de eventos para TODAS as conexões CONNECTED (iFood e
// 99Food, de todos os tenants). Pensado para ser chamado por um cron a cada
// 1 minuto — dentro da janela "a cada 30s" recomendada pelo iFood (rodar
// menos frequente é aceitável; rodar mais que isso por instância é o que a
// doc realmente pede caso a própria Vercel tenha esse cron dedicado).
//
// Cada conexão é processada de forma isolada: erro em uma loja não afeta
// as demais. Eventos cujo processamento falha NÃO são confirmados (ack) —
// voltam no próximo polling, evitando perda de pedido.

import { prisma } from '@/lib/db/client'
import { getMarketplaceClient } from './registry'
import { getValidAccessToken } from './token-manager'
import { processMarketplaceOrder } from './process-order'
import type { NormalizedMarketplaceEvent } from './types'

interface PollSummary {
  connectionId: string
  provider: string
  tenantId: string
  eventsReceived: number
  ordersProcessed: number
  error?: string
}

export async function pollAllConnections(): Promise<PollSummary[]> {
  const connections = await prisma.marketplaceConnection.findMany({
    where: { status: 'CONNECTED', externalMerchantId: { not: null } },
  })

  const results: PollSummary[] = []
  for (const connection of connections) {
    results.push(await pollConnection(connection))
  }
  return results
}

async function pollConnection(
  connection: Awaited<ReturnType<typeof prisma.marketplaceConnection.findFirst>>
): Promise<PollSummary> {
  if (!connection) {
    return { connectionId: '', provider: '', tenantId: '', eventsReceived: 0, ordersProcessed: 0, error: 'Conexão inválida' }
  }

  const summary: PollSummary = {
    connectionId: connection.id,
    provider: connection.provider,
    tenantId: connection.tenantId,
    eventsReceived: 0,
    ordersProcessed: 0,
  }

  try {
    const client = getMarketplaceClient(connection.provider)
    const accessToken = await getValidAccessToken(connection)
    const events = await client.pollEvents(accessToken, connection.externalMerchantId!)
    summary.eventsReceived = events.length

    if (events.length === 0) {
      await prisma.marketplaceConnection.update({
        where: { id: connection.id },
        data: { lastPolledAt: new Date(), lastPollingError: null },
      })
      return summary
    }

    const successfullyProcessedEventIds: string[] = []

    for (const event of events) {
      try {
        await handleEvent(connection, client, accessToken, event)
        successfullyProcessedEventIds.push(event.externalEventId)
        if (event.type === 'ORDER_PLACED') summary.ordersProcessed += 1
      } catch (err) {
        console.error(
          `[marketplace] Falha ao processar evento ${event.externalEventId} (${connection.provider}, tenant ${connection.tenantId}):`,
          err
        )
        // Não adiciona ao ack — volta no próximo polling.
      }
    }

    if (successfullyProcessedEventIds.length > 0) {
      await client.acknowledgeEvents(accessToken, successfullyProcessedEventIds)
    }

    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: { lastPolledAt: new Date(), lastPollingError: null },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido no polling'
    summary.error = message
    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: { lastPollingError: message },
    })
  }

  return summary
}

async function handleEvent(
  connection: NonNullable<Awaited<ReturnType<typeof prisma.marketplaceConnection.findFirst>>>,
  client: ReturnType<typeof getMarketplaceClient>,
  accessToken: string,
  event: NormalizedMarketplaceEvent
) {
  switch (event.type) {
    case 'ORDER_PLACED': {
      const normalized = await client.getOrder(accessToken, event.externalOrderId)

      // Confirmação automática só se o tenant ativou essa opção — caso
      // contrário, fica como RECEIVED até alguém confirmar manualmente
      // no dashboard (respeitando o prazo da plataforma, ex.: 8 min no iFood).
      if (connection.autoAcceptOrders) {
        await client.confirmOrder(accessToken, event.externalOrderId)
        await processMarketplaceOrder(connection, normalized)
      } else {
        await prisma.marketplaceOrder.upsert({
          where: {
            provider_externalOrderId: { provider: normalized.provider, externalOrderId: normalized.externalOrderId },
          },
          update: { rawPayload: normalized.rawPayload as any },
          create: {
            tenantId: connection.tenantId,
            connectionId: connection.id,
            provider: normalized.provider,
            externalOrderId: normalized.externalOrderId,
            externalDisplayId: normalized.externalDisplayId,
            status: 'RECEIVED',
            grossAmount: normalized.total,
            deliveredBy: normalized.deliveredBy,
            rawPayload: normalized.rawPayload as any,
          },
        })
      }
      break
    }

    case 'ORDER_CANCELLED': {
      await prisma.marketplaceOrder.updateMany({
        where: { provider: connection.provider, externalOrderId: event.externalOrderId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      })
      // Propagar cancelamento ao Order interno, se já existia
      const mpOrder = await prisma.marketplaceOrder.findUnique({
        where: { provider_externalOrderId: { provider: connection.provider, externalOrderId: event.externalOrderId } },
        select: { orderId: true },
      })
      if (mpOrder?.orderId) {
        await prisma.order.update({
          where: { id: mpOrder.orderId },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: `Cancelado na plataforma ${connection.provider}` },
        })
      }
      break
    }

    case 'ORDER_CANCELLATION_REQUESTED': {
      await prisma.marketplaceOrder.updateMany({
        where: { provider: connection.provider, externalOrderId: event.externalOrderId },
        data: { status: 'CANCELLATION_REQUESTED' },
      })
      break
    }

    case 'ORDER_READY':
    case 'ORDER_DISPATCHED':
    case 'ORDER_CONCLUDED': {
      const statusMap = {
        ORDER_READY: 'READY_FOR_PICKUP',
        ORDER_DISPATCHED: 'DISPATCHED',
        ORDER_CONCLUDED: 'CONCLUDED',
      } as const
      await prisma.marketplaceOrder.updateMany({
        where: { provider: connection.provider, externalOrderId: event.externalOrderId },
        data: { status: statusMap[event.type] },
      })
      break
    }

    case 'ORDER_CONFIRMED':
    case 'DRIVER_ASSIGNED':
    case 'UNKNOWN':
    default:
      // Sem ação necessária no nosso sistema — ainda assim confirmamos (ack)
      // o evento para não recebê-lo de novo, conforme orientação do iFood.
      break
  }
}
