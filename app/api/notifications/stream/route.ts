// app/api/notifications/stream/route.ts
//
// SSE stream de notificações para o dashboard.
// Envia alertas de novos pedidos com som e badge mesmo sem o kanban aberto.
//
// O cliente (dashboard layout) conecta uma vez e recebe eventos:
//   - new_order: novo pedido chegou
//   - low_stock: produto com estoque baixo
//   - payment_failed: falha de pagamento PIX

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { redis, CacheKeys } from '@/lib/cache/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        } catch {}
      }

      // Confirmar conexão
      send('connected', { tenantId, ts: Date.now() })

      // Heartbeat a cada 25s
      const heartbeat = setInterval(() => {
        send('heartbeat', { ts: Date.now() })
      }, 25_000)

      try {
        await (redis as any).subscribe(
          CacheKeys.orderChannel(tenantId),
          (message: string) => {
            try {
              const event = JSON.parse(message)
              // Apenas eventos relevantes para notificação
              if (event.type === 'ORDER_CREATED') {
                send('new_order', {
                  orderId: event.orderId,
                  orderNumber: event.orderNumber,
                  total: event.total,
                  type: event.type_order,
                })
              } else if (event.type === 'LOW_STOCK') {
                send('low_stock', {
                  productId:   event.productId,
                  productName: event.productName,
                  quantity:    event.quantity,
                })
              }
            } catch {}
          }
        )
      } catch {
        // Redis indisponível — modo degradado
      }

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        try { (redis as any).unsubscribe?.() } catch {}
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
