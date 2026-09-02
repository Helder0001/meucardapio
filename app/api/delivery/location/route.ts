// app/api/delivery/location/route.ts
//
// Recebe a posição GPS atual do entregador (chamado periodicamente pelo
// componente components/dashboard/courier-location-tracker.tsx, montado no
// dashboard enquanto o usuário logado tem uma entrega OUT_FOR_DELIVERY em
// andamento). O cliente final lê essa posição via polling em
// /api/orders/[id]/status (ver esse arquivo) para desenhar o mapa ao vivo.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  orderId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })

  const { orderId, lat, lng } = parsed.data
  const tenantId = session.user.tenantId
  const userId   = session.user.id

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: { id: true, type: true, status: true, courierId: true },
  })
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (order.type !== 'DELIVERY' || order.status !== 'OUT_FOR_DELIVERY') {
    // Silenciosamente ignora — o app do entregador pode chamar isso um
    // pouco depois do pedido já ter sido marcado como entregue (última
    // posição em trânsito antes do GPS parar de atualizar).
    return NextResponse.json({ ok: true, tracking: false })
  }

  // Só quem está entregando (ou, se ninguém assumiu ainda, qualquer
  // entregador do tenant) pode atualizar a posição — evita que um
  // entregador sobrescreva a posição da entrega de outro.
  if (order.courierId && order.courierId !== userId) {
    return NextResponse.json({ error: 'Este pedido está sendo entregue por outra pessoa.' }, { status: 403 })
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      courierId: order.courierId ?? userId,
      courierLat: lat,
      courierLng: lng,
      courierUpdatedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true, tracking: true })
}
