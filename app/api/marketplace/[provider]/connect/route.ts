// app/api/marketplace/[provider]/connect/route.ts
//
// Inicia a conexão do tenant com o marketplace.
//
// iFood: gera um link de autorização real (modelo "app centralizado") —
//   o lojista é redirecionado ao Portal do Parceiro iFood, loga e autoriza
//   o app da plataforma a acessar a loja dele. iFood devolve um
//   authorizationCode que tratamos em /callback.
//
// 99Food: não há (até a documentação pública atual) um redirect OAuth
//   self-service equivalente — a liberação depende da equipe comercial da
//   99Food autorizar um "slot de integração" Open Delivery e o lojista
//   confirmar dentro do 99Food Admin. Por isso aqui apenas registramos a
//   conexão como PENDING e orientamos os próximos passos manuais; quando
//   o AppShopID for obtido, o fluxo segue em /callback (chamado manualmente
//   pelo time de suporte ou por uma tela interna) ou por reconciliação.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
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

  const oauthState = crypto.randomBytes(24).toString('hex')
  const codeVerifier = crypto.randomBytes(32).toString('hex')

  const connection = await prisma.marketplaceConnection.upsert({
    where: { tenantId_provider: { tenantId, provider } },
    update: { status: 'PENDING', oauthState, authorizationCodeVerifier: codeVerifier },
    create: { tenantId, provider, status: 'PENDING', oauthState, authorizationCodeVerifier: codeVerifier },
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: 'MARKETPLACE_CONNECT_STARTED',
    resource: 'marketplaceConnection',
    resourceId: connection.id,
    metadata: { provider },
  })

  if (provider === 'IFOOD') {
    const appId = process.env.IFOOD_APP_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/marketplace/ifood/callback`

    if (!appId) {
      return NextResponse.json(
        { error: 'Integração com iFood ainda não homologada nesta plataforma. Contate o suporte.' },
        { status: 503 }
      )
    }

    // Link de autorização do Portal do Parceiro — formato conforme docs do iFood
    // para apps centralizados (o lojista loga com a conta dele e autoriza).
    const authorizationUrl =
      `https://portal.ifood.com.br/apps/${appId}/authorize` +
      `?state=${oauthState}&redirect_uri=${encodeURIComponent(redirectUri)}`

    return NextResponse.json({ authorizationUrl, mode: 'redirect' })
  }

  // 99Food: sem self-service público — orientamos o fluxo manual.
  return NextResponse.json({
    mode: 'manual',
    instructions:
      'A 99Food libera a integração por loja através da equipe comercial deles. ' +
      'Solicite à 99Food (ou ao seu gerente de contas) o link de autorização Open Delivery ' +
      'para esta loja. Após autorizado, envie o AppShopID para nosso suporte concluir a conexão.',
  })
}
