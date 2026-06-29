// app/api/marketplace/[provider]/callback/route.ts
//
// Recebe o retorno da autorização do marketplace.
//
// iFood: GET com query params (?state=...&authorizationCode=...) — é o
//   browser do lojista sendo redirecionado de volta pelo Portal do Parceiro.
//
// 99Food: como não há redirect OAuth self-service documentado publicamente,
//   este endpoint também aceita POST autenticado (chamado pela tela de
//   integrações do dashboard) com o AppShopID informado manualmente após
//   o lojista concluir a autorização no 99Food Admin.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { encrypt } from '@/lib/security/crypto'
import { getMarketplaceClient } from '@/lib/marketplace/registry'
import { parseProviderParam } from '@/lib/marketplace/provider-param'
import { auditLog } from '@/lib/utils/audit'

// ── iFood: redirect do navegador do lojista ─────────────────────────────────
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerParam } = await params
  const provider = parseProviderParam(providerParam)
  if (provider !== 'IFOOD') {
    return NextResponse.json({ error: 'Callback via GET disponível apenas para iFood' }, { status: 400 })
  }

  const url = new URL(request.url)
  const state = url.searchParams.get('state')
  const authorizationCode = url.searchParams.get('authorizationCode')
  const merchantId = url.searchParams.get('merchantId')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const failRedirect = `${appUrl}/dashboard/settings/integrations?error=ifood`

  if (!state || !authorizationCode) {
    return NextResponse.redirect(failRedirect)
  }

  const connection = await prisma.marketplaceConnection.findFirst({
    where: { provider: 'IFOOD', oauthState: state, status: 'PENDING' },
  })
  if (!connection) {
    return NextResponse.redirect(failRedirect)
  }

  try {
    const client = getMarketplaceClient('IFOOD')
    const tokenResult = await client.exchangeToken({
      authorizationCode,
      authorizationCodeVerifier: connection.authorizationCodeVerifier ?? '',
    })

    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: {
        status: 'CONNECTED',
        accessTokenEnc: encrypt(tokenResult.accessToken),
        refreshTokenEnc: tokenResult.refreshToken ? encrypt(tokenResult.refreshToken) : null,
        tokenType: tokenResult.tokenType,
        scope: tokenResult.scope,
        expiresAt: new Date(Date.now() + tokenResult.expiresInSeconds * 1000),
        externalMerchantId: merchantId ?? undefined,
        oauthState: null,
        authorizationCodeVerifier: null,
        connectedAt: new Date(),
      },
    })

    await auditLog({
      tenantId: connection.tenantId,
      action: 'MARKETPLACE_CONNECTED',
      resource: 'marketplaceConnection',
      resourceId: connection.id,
      metadata: { provider: 'IFOOD', merchantId },
    })

    return NextResponse.redirect(`${appUrl}/dashboard/settings/integrations?connected=ifood`)
  } catch (err) {
    console.error('[marketplace/ifood/callback]', err)
    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: { status: 'ERROR', lastPollingError: 'Falha ao concluir autorização' },
    })
    return NextResponse.redirect(failRedirect)
  }
}

// ── 99Food (e fallback genérico): conclusão manual autenticada ─────────────
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

  const body = await request.json().catch(() => ({}))
  const appShopId = typeof body.appShopId === 'string' ? body.appShopId.trim() : ''

  if (!appShopId) {
    return NextResponse.json({ error: 'Informe o AppShopID fornecido pela 99Food' }, { status: 400 })
  }

  const tenantId = session.user.tenantId
  const connection = await prisma.marketplaceConnection.findFirst({
    where: { tenantId, provider },
  })
  if (!connection) {
    return NextResponse.json({ error: 'Inicie a conexão antes de concluir' }, { status: 404 })
  }

  try {
    const client = getMarketplaceClient(provider)
    const tokenResult = await client.exchangeToken({ appShopId })

    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: {
        status: 'CONNECTED',
        accessTokenEnc: encrypt(tokenResult.accessToken),
        refreshTokenEnc: tokenResult.refreshToken ? encrypt(tokenResult.refreshToken) : null,
        tokenType: tokenResult.tokenType,
        expiresAt: new Date(Date.now() + tokenResult.expiresInSeconds * 1000),
        externalMerchantId: appShopId,
        connectedAt: new Date(),
        connectedByUserId: session.user.id,
      },
    })

    await auditLog({
      tenantId,
      userId: session.user.id,
      action: 'MARKETPLACE_CONNECTED',
      resource: 'marketplaceConnection',
      resourceId: connection.id,
      metadata: { provider },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[marketplace/callback/POST]', err)
    return NextResponse.json({ error: 'Não foi possível validar as credenciais informadas' }, { status: 400 })
  }
}
