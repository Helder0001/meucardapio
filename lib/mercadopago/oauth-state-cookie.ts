// lib/mercadopago/oauth-state-cookie.ts
//
// Guarda o par (state, code_verifier) do handshake PKCE entre a chamada de
// /connect e o retorno em /callback. Usamos um cookie httpOnly assinado
// (HMAC) em vez de uma tabela no banco porque esse dado é efêmero (vive
// só durante os ~2 minutos entre o lojista clicar "Conectar" e voltar do
// Mercado Pago) e não precisa de uma migration nova só para isso.
//
// O MercadoPagoConnection real só é criado em /callback, depois que a troca
// de tokens com o MP já deu certo — nada de "pendente" fica salvo no banco.

import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE_NAME = 'mp_oauth_handshake'
const MAX_AGE_SECONDS = 10 * 60 // 10 minutos — folga em relação aos 10 min de validade do code do MP

function getSigningSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.ORDER_TOKEN_SECRET
  if (!secret) throw new Error('AUTH_SECRET não configurado — necessário para assinar o cookie de handshake OAuth')
  return secret
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex')
}

export interface OAuthHandshake {
  state: string
  codeVerifier: string
  tenantId: string
}

export async function setOAuthHandshakeCookie(data: OAuthHandshake): Promise<void> {
  const payload = JSON.stringify(data)
  const signature = sign(payload)
  const value = Buffer.from(JSON.stringify({ payload, signature })).toString('base64url')

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/api/mercadopago',
  })
}

export async function readAndClearOAuthHandshakeCookie(): Promise<OAuthHandshake | null> {
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

    return JSON.parse(payload) as OAuthHandshake
  } catch {
    return null
  }
}
