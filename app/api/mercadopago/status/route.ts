// app/api/mercadopago/status/route.ts
//
// Retorna o estado da conexão MP do tenant para a tela de pagamentos.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const connection = await prisma.mercadoPagoConnection.findFirst({
    where: { tenantId: session.user.tenantId },
    select: {
      mpUserId: true,
      liveMode: true,
      connectedAt: true,
      lastRefreshedAt: true,
      revokedAt: true,
      scope: true,
    },
  })

  const tenant = await prisma.tenant.findFirst({
    where: { id: session.user.tenantId },
    select: { settings: true },
  })
  const hasLegacyToken = !!(tenant?.settings as any)?.mercadoPagoAccessToken

  const isConnected = !!connection && !connection.revokedAt

  return NextResponse.json({
    connected: isConnected,
    mpUserId: connection?.mpUserId ?? null,
    liveMode: connection?.liveMode ?? null,
    connectedAt: connection?.connectedAt ?? null,
    hasLegacyToken,
  })
}
