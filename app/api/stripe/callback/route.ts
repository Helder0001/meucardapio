// app/api/stripe/callback/route.ts
//
// Recebe o redirect do Stripe após o lojista autorizar o acesso. Troca o
// código por access_token/refresh_token e salva a conexão.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { encrypt } from '@/lib/security/crypto'
import { exchangeAuthorizationCode } from '@/lib/stripe/oauth-client'
import { readAndClearStripeOAuthHandshakeCookie } from '@/lib/stripe/oauth-state-cookie'
import { auditLog } from '@/lib/utils/audit'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const failRedirect = `${appUrl}/dashboard/settings/payments?error=stripe`

  const handshake = await readAndClearStripeOAuthHandshakeCookie()

  if (oauthError || !code || !returnedState || !handshake) {
    if (oauthError) console.warn('[stripe/callback] usuário negou ou cancelou a autorização:', oauthError)
    return NextResponse.redirect(failRedirect)
  }
  if (returnedState !== handshake.state) {
    console.warn('[stripe/callback] state mismatch — possível CSRF')
    return NextResponse.redirect(failRedirect)
  }

  try {
    const tokenResult = await exchangeAuthorizationCode(code)

    await prisma.stripeConnection.upsert({
      where: { tenantId: handshake.tenantId },
      update: {
        stripeUserId: tokenResult.stripeUserId,
        publishableKey: tokenResult.publishableKey,
        accessTokenEnc: encrypt(tokenResult.accessToken),
        refreshTokenEnc: tokenResult.refreshToken ? encrypt(tokenResult.refreshToken) : null,
        scope: tokenResult.scope,
        livemode: tokenResult.livemode,
        connectedAt: new Date(),
        revokedAt: null,
      },
      create: {
        tenantId: handshake.tenantId,
        stripeUserId: tokenResult.stripeUserId,
        publishableKey: tokenResult.publishableKey,
        accessTokenEnc: encrypt(tokenResult.accessToken),
        refreshTokenEnc: tokenResult.refreshToken ? encrypt(tokenResult.refreshToken) : null,
        scope: tokenResult.scope,
        livemode: tokenResult.livemode,
      },
    })

    await auditLog({
      tenantId: handshake.tenantId,
      action: 'STRIPE_CONNECTED',
      resource: 'stripeConnection',
      metadata: { stripeUserId: tokenResult.stripeUserId, livemode: tokenResult.livemode },
    })

    return NextResponse.redirect(`${appUrl}/dashboard/settings/payments?connected=stripe`)
  } catch (err) {
    console.error('[stripe/callback]', err)
    return NextResponse.redirect(failRedirect)
  }
}
