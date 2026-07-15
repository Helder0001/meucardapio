// app/api/stripe/disconnect/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { deauthorize } from '@/lib/stripe/oauth-client'
import { auditLog } from '@/lib/utils/audit'

export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para gerenciar pagamentos' }, { status: 403 })
  }

  const tenantId = session.user.tenantId
  const connection = await prisma.stripeConnection.findFirst({ where: { tenantId } })
  if (!connection) {
    return NextResponse.json({ ok: true })
  }

  // Diferente do MP, o Stripe tem um endpoint público de deauthorize —
  // chamamos de verdade em vez de só marcar como revogado localmente.
  try {
    await deauthorize(connection.stripeUserId)
  } catch (err) {
    console.error('[stripe/disconnect] erro ao desautorizar no Stripe (revogando localmente mesmo assim):', err)
  }

  await prisma.stripeConnection.update({
    where: { id: connection.id },
    data: { revokedAt: new Date() },
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: 'STRIPE_DISCONNECTED',
    resource: 'stripeConnection',
    resourceId: connection.id,
  })

  return NextResponse.json({ ok: true })
}
