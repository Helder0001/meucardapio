// app/api/stripe/status/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const connection = await prisma.stripeConnection.findFirst({
    where: { tenantId: session.user.tenantId },
    select: {
      stripeUserId: true,
      livemode: true,
      publishableKey: true,
      connectedAt: true,
      revokedAt: true,
      scope: true,
    },
  })

  const isConnected = !!connection && !connection.revokedAt

  return NextResponse.json({
    connected: isConnected,
    stripeUserId: connection?.stripeUserId ?? null,
    livemode: connection?.livemode ?? null,
    connectedAt: connection?.connectedAt ?? null,
  })
}
