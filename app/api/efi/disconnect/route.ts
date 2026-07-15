// app/api/efi/disconnect/route.ts

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
  const connection = await prisma.efiConnection.findFirst({ where: { tenantId } })
  if (!connection) {
    return NextResponse.json({ ok: true })
  }

  // A Efí não tem endpoint de revogação remota pra credenciais de
  // aplicação (não é OAuth) — desconectar aqui é local: paramos de usar
  // essas credenciais. Se o tenant quiser invalidar de verdade, precisa
  // recriar o Client Secret no painel dele.
  await prisma.efiConnection.update({
    where: { id: connection.id },
    data: { revokedAt: new Date() },
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: 'EFI_DISCONNECTED',
    resource: 'efiConnection',
    resourceId: connection.id,
  })

  return NextResponse.json({ ok: true })
}
