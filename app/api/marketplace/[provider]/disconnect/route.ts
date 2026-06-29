// app/api/marketplace/[provider]/disconnect/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { parseProviderParam } from '@/lib/marketplace/provider-param'
import { auditLog } from '@/lib/utils/audit'

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para gerenciar integrações' }, { status: 403 })
  }

  const { provider: providerParam } = await params
  const provider = parseProviderParam(providerParam)
  if (!provider) {
    return NextResponse.json({ error: 'Marketplace não suportado' }, { status: 400 })
  }

  const tenantId = session.user.tenantId
  const connection = await prisma.marketplaceConnection.findFirst({ where: { tenantId, provider } })
  if (!connection) {
    return NextResponse.json({ ok: true }) // já desconectado / nunca conectado
  }

  await prisma.marketplaceConnection.update({
    where: { id: connection.id },
    data: {
      status: 'DISCONNECTED',
      accessTokenEnc: null,
      refreshTokenEnc: null,
      disconnectedAt: new Date(),
    },
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: 'MARKETPLACE_DISCONNECTED',
    resource: 'marketplaceConnection',
    resourceId: connection.id,
    metadata: { provider },
  })

  // Nota: não revogamos o token na plataforma de origem aqui porque nem
  // iFood nem 99Food expõem um endpoint público de "revoke" documentado
  // de forma consistente — o lojista também pode (e deve, por segurança)
  // remover a autorização do lado de lá, no painel do próprio marketplace.

  return NextResponse.json({ ok: true })
}
