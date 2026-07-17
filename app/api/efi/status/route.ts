// app/api/efi/status/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const connection = await prisma.efiConnection.findFirst({
    where: { tenantId: session.user.tenantId },
    select: {
      accountIdentifier: true,
      sandbox: true,
      connectedAt: true,
      revokedAt: true,
      pixKey: true,
    },
  })

  const isConnected = !!connection && !connection.revokedAt

  return NextResponse.json({
    connected: isConnected,
    sandbox: connection?.sandbox ?? null,
    connectedAt: connection?.connectedAt ?? null,
    pixEnabled: !!connection?.pixKey,
  })
}
