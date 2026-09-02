// app/api/delivery/active/route.ts
//
// Retorna os pedidos DELIVERY em status OUT_FOR_DELIVERY atribuídos ao
// usuário logado (ou, no caso de DELIVERY_PERSON, todos os pedidos "saiu
// para entrega" do tenant sem entregador atribuído, para ele poder assumir
// só de já estar mandando localização). Usado pelo courier-location-tracker
// para saber para quais pedidos deve enviar a posição atual.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = session.user.tenantId
  const userId   = session.user.id

  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      type: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
      OR: [{ courierId: userId }, { courierId: null }],
    },
    select: { id: true, orderNumber: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ orders })
}
