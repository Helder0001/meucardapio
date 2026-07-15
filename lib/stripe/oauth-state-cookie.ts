// lib/stripe/oauth-state-cookie.ts
//
// Mesmo esquema do lib/mercadopago/oauth-state-cookie.ts: cookie httpOnly
// assinado (HMAC) pra guardar o `state` entre /connect e /callback. Como o
// Stripe Connect OAuth clássico não usa PKCE, aqui só precisamos do state
// e do tenantId — nada de codeVerifier.

import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE_NAME = 'stripe_oauth_handshake'
const MAX_AGE_SECONDS = 10 * 60

function getSigningSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.ORDER_TOKEN_SECRET
  if (!secret) throw new Error('AUTH_SECRET não configurado — necessário para assinar o cookie de handshake OAuth')
  return secret
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex')
}

export interface StripeOAuthHandshake {
  state: string
  tenantId: string
}

export async function setStripeOAuthHandshakeCookie(data: StripeOAuthHandshake): Promise<void> {
  const payload = JSON.stringify(data)
  const signature = sign(payload)
  const value = Buffer.from(JSON.stringify({ payload, signature })).toString('base64url')

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/api/stripe',
  })
}

export async function readAndClearStripeOAuthHandshakeCookie(): Promise<StripeOAuthHandshake | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(COOKIE_NAME)?.value
  cookieStore.delete(COOKIE_NAME)

  if (!raw) return null

  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'))
    const { payload, signature } = decoded

    const expectedSignature = sign(payload)
    if (expectedSignature.length !== signature.length) return null
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    )
    if (!isValid) return null

    return JSON.parse(payload) as StripeOAuthHandshake
  } catch {
    return null
  }
}
