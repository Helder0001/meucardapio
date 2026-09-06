// app/api/delivery/route/route.ts
//
// Calcula a rota (distância, tempo estimado, traçado) entre um ponto de
// origem (posição atual do entregador, ou a loja se ele ainda não começou
// a compartilhar localização) e o destino do pedido — usado pela tela
// dedicada do entregador (components/dashboard/delivery-tracking-screen.tsx)
// e, futuramente, pelo mapa do cliente.
//
// Fica atrás de sessão autenticada (só staff do próprio tenant) e de um
// rate limit por IP, porque o OSRM público (ver lib/utils/osrm.ts) é um
// serviço compartilhado — não queremos que um bug no polling do frontend
// vire uma rajada de chamadas.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { getDrivingRoute } from '@/lib/utils/osrm'
import { apiLimiter } from '@/lib/security/rate-limit'
import { z } from 'zod'

const schema = z.object({
  orderId: z.string().min(1),
  // Posição atual de quem está pedindo a rota (o navegador do entregador).
  // Se omitida, calculamos a partir da loja (útil antes do GPS responder).
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
})

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { success } = await apiLimiter.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = schema.safeParse({
    orderId: searchParams.get('orderId'),
    lat: searchParams.get('lat') ?? undefined,
    lng: searchParams.get('lng') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  const order = await prisma.order.findFirst({
    where: { id: parsed.data.orderId, tenantId: session.user.tenantId, type: 'DELIVERY' },
    select: {
      deliveryLat: true,
      deliveryLng: true,
      tenant: { select: { latitude: true, longitude: true } },
    },
  })
  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }
  if (order.deliveryLat == null || order.deliveryLng == null) {
    return NextResponse.json({ error: 'Endereço de entrega ainda não geocodificado' }, { status: 422 })
  }

  const origin =
    parsed.data.lat != null && parsed.data.lng != null
      ? { lat: parsed.data.lat, lng: parsed.data.lng }
      : order.tenant.latitude != null && order.tenant.longitude != null
        ? { lat: order.tenant.latitude, lng: order.tenant.longitude }
        : null

  if (!origin) {
    return NextResponse.json({ error: 'Sem ponto de partida disponível' }, { status: 422 })
  }

  const destination = { lat: order.deliveryLat, lng: order.deliveryLng }

  const route = await getDrivingRoute(origin, destination)
  if (!route) {
    return NextResponse.json({ error: 'Não foi possível calcular a rota agora' }, { status: 502 })
  }

  return NextResponse.json({ route })
}
