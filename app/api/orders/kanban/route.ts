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
  // só vê pedidos desses PDVs (ou sem PDV, se for balcão online).
  // Admin e Gerente veem tudo.
  let pdvFilter: { pdvId: string | null } | { pdvId: { in: string[] } } | undefined
  if (!['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(role)) {
    const pdvAccess = await prisma.pDVUser.findMany({
      where: { userId },
      select: { pdvId: true },
    })
    if (pdvAccess.length > 0) {
      pdvFilter = { pdvId: { in: pdvAccess.map((p) => p.pdvId) } }
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
          addons: { select: { addonName: true } },
        },
      },
    },
  })

  // 3. Serializar (converter Decimal para number)
  const serialized = activeOrders.map((o) => ({
    ...o,
    total: Number(o.total),
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

      // Criar cliente Redis dedicado para subscribe
      // (não podemos usar o cliente principal enquanto está subscrito)
      const subscriber = redis

      try {
        // Inscrever no canal do tenant
        // Quando createOrderAction ou updateOrderStatus publicar evento,
        // este callback é chamado e envia o SSE para o cliente
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
      }

      // Limpar quando o cliente desconectar
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        try {
          ;(subscriber as any).unsubscribe?.()
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
