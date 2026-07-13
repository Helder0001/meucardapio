// lib/efi/client.ts
//
// Cliente da API de Cobranças da Efí Bank (ex-Gerencianet), usada pra
// substituir o Mercado Pago Preapproval na cobrança recorrente do PRÓPRIO
// plano PRO da plataforma (Meu Cardápio). Isso NÃO afeta os pagamentos dos
// tenants pros clientes deles (PIX/cartão no cardápio) — aquilo continua
// 100% no Mercado Pago, cada tenant com sua própria conta conectada.
//
// A API de Cobranças da Efí usa OAuth2 (client_credentials) com HTTP Basic
// Auth simples — diferente da API Pix da Efí, aqui NÃO é preciso certificado
// mTLS (.p12). Só client_id + client_secret.
//
// Docs: https://dev.efipay.com.br/en/docs/api-cobrancas/credenciais

const isSandbox = process.env.EFI_SANDBOX !== 'false' // default: sandbox, precisa setar 'false' explicitamente em produção

const BASE_URL = isSandbox
  ? 'https://cobrancas-h.api.efipay.com.br'
  : 'https://cobrancas.api.efipay.com.br'

interface EfiTokenCache {
  accessToken: string
  expiresAt: number // epoch ms
}

// Cache em memória do processo (funções serverless são efêmeras, então isso
// só evita reautenticar em chamadas sequenciais dentro da mesma invocação/
// instância quente — não é um cache persistente entre cold starts).
let tokenCache: EfiTokenCache | null = null

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 5_000) {
    return tokenCache.accessToken
  }

  const clientId = process.env.EFI_CLIENT_ID
  const clientSecret = process.env.EFI_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('EFI_CLIENT_ID / EFI_CLIENT_SECRET não configurados')
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(`${BASE_URL}/v1/authorize`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[efi][auth] Falha ao autenticar (${res.status}): ${body.slice(0, 500)}`)
  }

  const data = await res.json()
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 600) * 1000,
  }
  return tokenCache.accessToken
}

export class EfiApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`[efi] Erro ${status}: ${JSON.stringify(body).slice(0, 500)}`)
    this.status = status
    this.body = body
  }
}

/** Faz uma requisição autenticada contra a API de Cobranças da Efí. */
export async function efiRequest<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  // DEBUG TEMPORÁRIO — remover depois de confirmar o ambiente real usado.
  console.log('[efi][debug] ambiente:', isSandbox ? 'SANDBOX' : 'PRODUÇÃO', '| BASE_URL:', BASE_URL, '| path:', path)

  const accessToken = await getAccessToken()

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    throw new EfiApiError(res.status, json)
  }

  return json as T
}

/** Valores monetários na Efí são em CENTAVOS (inteiro), diferente do MP. */
export function toEfiCents(amountBRL: number): number {
  return Math.round(amountBRL * 100)
}
