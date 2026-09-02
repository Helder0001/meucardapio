// app/api/asaas/status/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const connection = await prisma.asaasConnection.findFirst({
    where: { tenantId: session.user.tenantId, revokedAt: null },
    select: { asaasAccountId: true, connectedAt: true },
  })

  return NextResponse.json({
    connected: !!connection,
    accountId: connection?.asaasAccountId ?? null,
    connectedAt: connection?.connectedAt ?? null,
  })
}
