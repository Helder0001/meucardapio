// app/api/mercadopago/disconnect/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
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
  const connection = await prisma.mercadoPagoConnection.findFirst({ where: { tenantId } })
  if (!connection) {
    return NextResponse.json({ ok: true })
  }

  // O Mercado Pago não expõe um endpoint público estável de "revoke" de
  // acesso OAuth — a forma suportada é o próprio lojista remover o acesso
  // em mercadopago.com.br/account/security. Aqui invalidamos localmente:
  // o token deixa de ser usado por este sistema a partir de agora.
  await prisma.mercadoPagoConnection.update({
    where: { id: connection.id },
    data: { revokedAt: new Date() },
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: 'MERCADOPAGO_DISCONNECTED',
    resource: 'mercadoPagoConnection',
    resourceId: connection.id,
  })

  return NextResponse.json({ ok: true })
}
