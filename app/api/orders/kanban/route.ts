// app/api/orders/kanban/route.ts
//
// Server-Sent Events (SSE) para o kanban em tempo real.
//
// Por que SSE e não WebSocket?
// - SSE é unidirecional (servidor → cliente), ideal para atualizações de status
// - Funciona nativamente em Next.js/Vercel sem infraestrutura extra
// - Reconecta automaticamente se a conexão cair
// - Muito mais simples que WebSocket para este caso de uso
//
// Fluxo:
// 1. Cliente abre conexão GET /api/orders/kanban
// 2. Servidor envia estado inicial de todos os pedidos ativos
// 3. Servidor fica ouvindo o canal Redis Pub/Sub do tenant
// 4. Quando um pedido muda → publica no Redis → servidor envia evento SSE
// 5. Cliente (KanbanBoard) atualiza o estado local sem recarregar

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { redis, CacheKeys } from '@/lib/cache/redis'

export const runtime = 'nodejs' // SSE não funciona no Edge runtime
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // 1. Verificar autenticação
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  const userId   = session.user.id
  const role     = session.user.role

  // Multi-PDV isolation: se o usuário está vinculado a PDV(s) específicos,
  // só vê pedidos desses PDVs.
  // Exceção: PDV do tipo DELIVERY também exibe pedidos online sem pdvId.
  // Admin e Gerente veem tudo.
  let pdvFilter: object | undefined
  if (!['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(role)) {
    const pdvAccess = await prisma.pDVUser.findMany({
      where: { userId },
      select: { pdvId: true, pdv: { select: { type: true } } },
    })
    if (pdvAccess.length > 0) {
      const pdvIds = pdvAccess.map((p) => p.pdvId)
      const hasDeliveryPdv = pdvAccess.some((p) => p.pdv.type === 'DELIVERY')

      if (hasDeliveryPdv) {
        // PDVs de entrega: vê pedidos dos seus PDVs OU pedidos delivery sem PDV (online)
        pdvFilter = {
          OR: [
            { pdvId: { in: pdvIds } },
            { pdvId: null, type: 'DELIVERY' },
          ],
        }
      } else {
        pdvFilter = { pdvId: { in: pdvIds } }
      }
    }
  }

  // 2. Buscar estado inicial dos pedidos ativos
  const activeOrders = await prisma.order.findMany({
    where: {
      tenantId,
      ...(pdvFilter ?? {}),
      status: {
        notIn: ['DELIVERED', 'CANCELLED', 'REFUNDED'],
      },
      createdAt: {
        gte: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      type: true,
      total: true,
      createdAt: true,
      notes: true,
      deliveryBairro: true,
      kitchenRound: true,
      table: { select: { number: true, sector: true } },
      customer: { select: { name: true, phone: true } },
      waiter: { select: { name: true } },
      pdv: { select: { name: true } },
      items: {
        select: {
          id: true,
          productName: true,
          quantity: true,
          notes: true,
          kitchenRound: true,
          addons: { select: { addonName: true } },
        },
      },
    },
  })

  // 3. Serializar (converter Decimal para number). Pedidos balcão/mesa
  // reabertos após ENTREGUE (kitchenRound > 0) mostram no card apenas os
  // itens da rodada atual — os itens antigos já saíram pra cozinha e
  // continuam só no total/fatura do pedido, não aqui.
  const serialized = activeOrders.map((o) => ({
    ...o,
    total: Number(o.total),
    items: o.kitchenRound > 0 ? o.items.filter((i) => i.kitchenRound === o.kitchenRound) : o.items,
  }))

  // 4. Criar stream SSE
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        } catch {
          // Controller fechado — conexão encerrada pelo cliente
        }
      }

      // Enviar estado inicial
      send('init', { orders: serialized })

      // Enviar heartbeat a cada 30s para manter conexão viva
      const heartbeat = setInterval(() => {
        send('heartbeat', { ts: Date.now() })
      }, 30_000)

      // A Vercel mata funções serverless após um tempo máximo (300s aqui) —
      // isso já era tratado no cliente (reconecta via onerror), mas cada
      // conexão morta gerava um "Vercel Runtime Timeout Error" barulhento
      // nos logs. Fechamos a conexão de forma graciosa um pouco antes desse
      // limite, avisando o cliente pra reconectar na hora, sem esperar o
      // erro/timeout.
      const gracefulClose = setTimeout(() => {
        send('reconnect', { reason: 'graceful-timeout' })
        clearInterval(heartbeat)
        try { controller.close() } catch {}
      }, 280_000) // 280s — 20s de margem antes do limite de 300s da Vercel

      // Criar cliente Redis dedicado para subscribe
      // (o cliente principal não pode ser usado enquanto está no modo subscribe)
      let subscriber: any = null
      try {
        // Importar Redis e criar instância separada
        const { Redis } = await import('@upstash/redis')
        subscriber = new Redis({
          url:   process.env.UPSTASH_REDIS_REST_URL!,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        })

        // Inscrever no canal do tenant
        await (subscriber as any).subscribe(
          CacheKeys.orderChannel(tenantId),
          (message: string) => {
            try {
              const event = JSON.parse(message)
              send('order_update', event)
            } catch {
              // Mensagem inválida — ignorar
            }
          }
        )
      } catch {
        // Redis Pub/Sub não disponível — modo degradado (apenas estado inicial)
        subscriber = null
      }

      // Limpar quando o cliente desconectar
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        clearTimeout(gracefulClose)
        try {
          if (subscriber) subscriber.unsubscribe?.()
        } catch {}
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Desabilitar buffer no Nginx
    },
  })
}
