// lib/mercadopago/oauth-client.ts
//
// Cliente OAuth (Mercado Pago Connect) para conectar a conta do
// RESTAURANTE (não a da plataforma) — usado para gerar PIX e processar
// pagamentos dos clientes finais direto na conta do tenant.
//
// Documentação: https://www.mercadopago.com.br/developers/pt/docs/security/oauth
//
// IMPORTANTE: desde 2024 o Mercado Pago exige PKCE no fluxo authorization_code.
// Isso precisa estar habilitado em "Detalhes da aplicação → Editar" no painel
// do desenvolvedor da PLATAFORMA (não do restaurante) antes de funcionar.
//
// Fluxo:
// 1. Gerar code_verifier + code_challenge (S256)
// 2. Redirecionar o lojista para /authorization com code_challenge
// 3. Lojista loga na própria conta MP e autoriza
// 4. MP redireciona de volta com ?code=...&state=...
// 5. Trocar code + code_verifier por access_token/refresh_token

import crypto from 'crypto'

const MP_CLIENT_ID = process.env.MERCADOPAGO_CLIENT_ID
const MP_CLIENT_SECRET = process.env.MERCADOPAGO_CLIENT_SECRET
const MP_OAUTH_BASE = 'https://auth.mercadopago.com'
const MP_API_BASE = 'https://api.mercadopago.com'

function assertCredentials() {
  if (!MP_CLIENT_ID || !MP_CLIENT_SECRET) {
    throw new Error(
      'MERCADOPAGO_CLIENT_ID / MERCADOPAGO_CLIENT_SECRET não configurados. ' +
      'São credenciais da aplicação da PLATAFORMA no painel de desenvolvedor do Mercado Pago ' +
      '(não confundir com o access token de cada restaurante).'
    )
  }
}

export interface PkcePair {
  codeVerifier: string
  codeChallenge: string
}

// PKCE com S256: code_verifier é um random string; code_challenge é o hash
// SHA-256 dele, em base64url (sem padding) — exigido pelo MP desde 2024.
export function generatePkcePair(): PkcePair {
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

export function buildAuthorizationUrl(params: { state: string; codeChallenge: string; redirectUri: string }): string {
  assertCredentials()
  const url = new URL(`${MP_OAUTH_BASE}/authorization`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', MP_CLIENT_ID!)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export interface MpTokenResult {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresInSeconds: number
  scope: string
  userId: number
  publicKey: string
  liveMode: boolean
}

export async function exchangeAuthorizationCode(params: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<MpTokenResult> {
  assertCredentials()

  const res = await fetch(`${MP_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Mercado Pago: falha ao trocar código por token (${res.status}): ${errBody}`)
  }

  const data = await res.json()
  return mapTokenResponse(data)
}

export async function refreshAccessToken(refreshToken: string): Promise<MpTokenResult> {
  assertCredentials()

  const res = await fetch(`${MP_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Mercado Pago: falha ao renovar token (${res.status}): ${errBody}`)
  }

  const data = await res.json()
  return mapTokenResponse(data)
}

function mapTokenResponse(data: any): MpTokenResult {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type ?? 'bearer',
    expiresInSeconds: Number(data.expires_in ?? 15_552_000), // padrão: 180 dias
    scope: data.scope ?? '',
    userId: Number(data.user_id),
    publicKey: data.public_key ?? '',
    liveMode: Boolean(data.live_mode),
  }
}

// Revoga o acesso concedido (best-effort — usado ao desconectar).
// O MP não documenta um endpoint de "revoke" estável publicamente; a forma
// suportada é o próprio usuário remover o acesso em
// https://www.mercadopago.com.br/account/security — por isso aqui apenas
// invalidamos localmente (ver disconnect route) e orientamos o lojista.
