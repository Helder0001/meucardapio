// app/api/marketplace/[provider]/settings/route.ts
//
// Atualiza preferências operacionais da conexão: aceitar pedidos
// automaticamente, e abrir/pausar o recebimento de novos pedidos.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { parseProviderParam } from '@/lib/marketplace/provider-param'

export async function PATCH(request: Request, { params }: { params: Promise<{ provider: string }> }) {
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

  const body = await request.json().catch(() => ({}))
  const data: { autoAcceptOrders?: boolean; isOpen?: boolean } = {}
  if (typeof body.autoAcceptOrders === 'boolean') data.autoAcceptOrders = body.autoAcceptOrders
  if (typeof body.isOpen === 'boolean') data.isOpen = body.isOpen

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nenhuma alteração informada' }, { status: 400 })
  }

  const connection = await prisma.marketplaceConnection.findFirst({
    where: { tenantId: session.user.tenantId, provider },
  })
  if (!connection) {
    return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 })
  }

  await prisma.marketplaceConnection.update({ where: { id: connection.id }, data })

  return NextResponse.json({ ok: true })
}
