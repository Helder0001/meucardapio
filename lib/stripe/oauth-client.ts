// lib/stripe/oauth-client.ts
//
// OAuth Standard do Stripe Connect — mesmo padrão do MP: o tenant é
// redirecionado pro Stripe, loga com a CONTA DELE, autoriza, e volta com
// um código que trocamos por um access_token. Diferente do MP, não usa
// PKCE (o Stripe Connect OAuth clássico não exige).
//
// Docs: https://docs.stripe.com/connect/oauth-reference

const AUTHORIZE_URL = 'https://connect.stripe.com/oauth/authorize'
const TOKEN_URL = 'https://connect.stripe.com/oauth/token'
const DEAUTHORIZE_URL = 'https://connect.stripe.com/oauth/deauthorize'

export function buildAuthorizationUrl(params: { state: string; redirectUri: string }): string {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID
  if (!clientId) throw new Error('STRIPE_CONNECT_CLIENT_ID não configurado')

  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'read_write',
    redirect_uri: params.redirectUri,
    state: params.state,
  })

  return `${AUTHORIZE_URL}?${query.toString()}`
}

interface StripeTokenResult {
  accessToken: string
  refreshToken?: string
  tokenType: string
  scope?: string
  livemode: boolean
  stripeUserId: string
  publishableKey?: string
}

export async function exchangeAuthorizationCode(code: string): Promise<StripeTokenResult> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY não configurado')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(`[stripe][oauth] Falha na troca do código: ${JSON.stringify(data).slice(0, 500)}`)
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    scope: data.scope,
    livemode: Boolean(data.livemode),
    stripeUserId: data.stripe_user_id,
    publishableKey: data.stripe_publishable_key,
  }
}

/** Desconecta a conta do tenant do nosso app Stripe Connect. */
export async function deauthorize(stripeUserId: string): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID
  if (!secretKey || !clientId) throw new Error('Stripe não configurado no servidor')

  const res = await fetch(DEAUTHORIZE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      stripe_user_id: stripeUserId,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[stripe][oauth] Falha ao desconectar: ${body.slice(0, 500)}`)
  }
}
