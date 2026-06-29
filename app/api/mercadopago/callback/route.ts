// app/api/mercadopago/callback/route.ts
//
// Recebe o redirect do Mercado Pago após o lojista autorizar o acesso.
// Troca o código por access_token/refresh_token e salva a conexão.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { encrypt } from '@/lib/security/crypto'
import { exchangeAuthorizationCode } from '@/lib/mercadopago/oauth-client'
import { readAndClearOAuthHandshakeCookie } from '@/lib/mercadopago/oauth-state-cookie'
import { auditLog } from '@/lib/utils/audit'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const failRedirect = `${appUrl}/dashboard/settings/payments?error=mercadopago`

  const handshake = await readAndClearOAuthHandshakeCookie()

  if (!code || !returnedState || !handshake) {
    return NextResponse.redirect(failRedirect)
  }
  if (returnedState !== handshake.state) {
    console.warn('[mercadopago/callback] state mismatch — possível CSRF')
    return NextResponse.redirect(failRedirect)
  }

  const redirectUri = `${appUrl}/api/mercadopago/callback`

  try {
    const tokenResult = await exchangeAuthorizationCode({
      code,
      codeVerifier: handshake.codeVerifier,
      redirectUri,
    })

    await prisma.mercadoPagoConnection.upsert({
      where: { tenantId: handshake.tenantId },
      update: {
        mpUserId: String(tokenResult.userId),
        publicKey: tokenResult.publicKey,
        accessTokenEnc: encrypt(tokenResult.accessToken),
        refreshTokenEnc: encrypt(tokenResult.refreshToken),
        tokenType: tokenResult.tokenType,
        scope: tokenResult.scope,
        expiresAt: new Date(Date.now() + tokenResult.expiresInSeconds * 1000),
        liveMode: tokenResult.liveMode,
        connectedAt: new Date(),
        revokedAt: null,
      },
      create: {
        tenantId: handshake.tenantId,
        mpUserId: String(tokenResult.userId),
        publicKey: tokenResult.publicKey,
        accessTokenEnc: encrypt(tokenResult.accessToken),
        refreshTokenEnc: encrypt(tokenResult.refreshToken),
        tokenType: tokenResult.tokenType,
        scope: tokenResult.scope,
        expiresAt: new Date(Date.now() + tokenResult.expiresInSeconds * 1000),
        liveMode: tokenResult.liveMode,
      },
    })

    await auditLog({
      tenantId: handshake.tenantId,
      action: 'MERCADOPAGO_CONNECTED',
      resource: 'mercadoPagoConnection',
      metadata: { mpUserId: tokenResult.userId, liveMode: tokenResult.liveMode },
    })

    return NextResponse.redirect(`${appUrl}/dashboard/settings/payments?connected=mercadopago`)
  } catch (err) {
    console.error('[mercadopago/callback]', err)
    return NextResponse.redirect(failRedirect)
  }
}
