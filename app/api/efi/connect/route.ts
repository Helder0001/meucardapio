// app/api/efi/connect/route.ts
//
// "Cadastro" da Efí (não é OAuth de verdade — a Efí não oferece isso pra
// plataformas terceiras). O tenant cola aqui o Client ID/Secret e o
// identificador de conta que ele mesmo gerou no painel da própria conta
// Efí dele.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { encrypt } from '@/lib/security/crypto'
import { validateEfiCredentials } from '@/lib/efi/tenant-client'
import { auditLog } from '@/lib/utils/audit'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para gerenciar pagamentos' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
  const clientSecret = typeof body?.clientSecret === 'string' ? body.clientSecret.trim() : ''
  const accountIdentifier = typeof body?.accountIdentifier === 'string' ? body.accountIdentifier.trim() : null
  const sandbox = body?.sandbox !== false // default true (sandbox) se não vier explícito

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Client ID e Client Secret são obrigatórios.' }, { status: 400 })
  }

  const validation = await validateEfiCredentials({ clientId, clientSecret, sandbox })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const tenantId = session.user.tenantId

  await prisma.efiConnection.upsert({
    where: { tenantId },
    update: {
      clientIdEnc: encrypt(clientId),
      clientSecretEnc: encrypt(clientSecret),
      accountIdentifier,
      sandbox,
      connectedAt: new Date(),
      connectedByUserId: session.user.id,
      revokedAt: null,
    },
    create: {
      tenantId,
      clientIdEnc: encrypt(clientId),
      clientSecretEnc: encrypt(clientSecret),
      accountIdentifier,
      sandbox,
      connectedByUserId: session.user.id,
    },
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: 'EFI_CONNECTED',
    resource: 'efiConnection',
    metadata: { sandbox },
  })

  return NextResponse.json({ ok: true })
}
