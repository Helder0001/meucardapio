// app/api/marketplace/connections/route.ts
//
// Lista o estado das conexões de marketplace (iFood/99Food) do tenant —
// usado pela tela /dashboard/settings/integrations para montar os cards.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const connections = await prisma.marketplaceConnection.findMany({
    where: { tenantId: session.user.tenantId },
    select: {
      id: true,
      provider: true,
      status: true,
      merchantName: true,
      externalMerchantId: true,
      autoAcceptOrders: true,
      isOpen: true,
      lastPolledAt: true,
      lastPollingError: true,
      connectedAt: true,
      _count: { select: { orders: true } },
    },
  })

  return NextResponse.json({ connections })
}
