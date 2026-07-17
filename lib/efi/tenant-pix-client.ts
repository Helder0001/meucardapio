// lib/efi/tenant-pix-client.ts
//
// Cliente da API Pix da Efí (cobrança avulsa/imediata) — API DIFERENTE da
// API de Cobranças usada pro cartão (lib/efi/tenant-client.ts) e da usada
// pela assinatura da plataforma (lib/efi/client.ts). Por exigência do
// Banco Central, TODA requisição aqui (incluindo a autenticação) precisa
// ser feita com um certificado cliente (.p12) em uma conexão mTLS —
// o `fetch` do Node/undici não expõe isso de forma simples e portável,
// então usamos o módulo `https` nativo diretamente.
//
// Docs: https://dev.efipay.com.br/en/docs/api-pix/credenciais/

import https from 'https'

interface PixMtlsCredentials {
  clientId: string
  clientSecret: string
  pfx: Buffer          // certificado .p12 decodificado
  passphrase: string   // geralmente vazia ("") — a Efí não usa senha por padrão
  sandbox: boolean
}

function baseHost(sandbox: boolean): string {
  return sandbox ? 'pix-h.api.efipay.com.br' : 'pix.api.efipay.com.br'
}

/** Requisição HTTPS com certificado cliente (mTLS) — Promise em cima de https.request. */
function mtlsRequest<T = any>(
  creds: Pick<PixMtlsCredentials, 'pfx' | 'passphrase' | 'sandbox'>,
  options: { method: string; path: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: baseHost(creds.sandbox),
        path: options.path,
        method: options.method,
        pfx: creds.pfx,
        passphrase: creds.passphrase,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let parsed: any = null
          try {
            parsed = raw ? JSON.parse(raw) : null
          } catch {
            parsed = raw
          }
          resolve({ status: res.statusCode ?? 0, data: parsed })
        })
      }
    )

    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('Timeout na requisição à API Pix da Efí')))

    if (options.body) req.write(options.body)
    req.end()
  })
}

/** Autentica na API Pix (retorna access_token) — usado tanto pra validar credenciais na hora de cadastrar quanto pra cobrar de verdade depois. */
export async function authorizePixApi(creds: PixMtlsCredentials): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')

  try {
    const { status, data } = await mtlsRequest(creds, {
      method: 'POST',
      path: '/oauth/token',
      headers: { Authorization: `Basic ${basicAuth}` },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    })

    if (status !== 200 || !data?.access_token) {
      console.warn('[efi][pix] falha na autenticação', { status, data })
      return {
        ok: false,
        error: status === 401
          ? 'Client ID/Secret ou certificado do Pix inválidos.'
          : 'Não foi possível autenticar na API Pix da Efí.',
      }
    }

    return { ok: true, accessToken: data.access_token }
  } catch (err) {
    console.error('[efi][pix] erro ao autenticar', String(err))
    return { ok: false, error: 'Erro ao conectar com a API Pix da Efí — verifique o certificado enviado.' }
  }
}

interface CreateChargeParams extends PixMtlsCredentials {
  accessToken: string
  pixKey: string
  amount: number // em reais
  payerCpf: string
  payerName: string
  description: string
  expirationSeconds?: number
}

export async function createImmediatePixCharge(params: CreateChargeParams): Promise<{
  txid: string
  pixCopiaECola: string
  location: string
  status: string
}> {
  const body = JSON.stringify({
    calendario: { expiracao: params.expirationSeconds ?? 3600 },
    devedor: { cpf: params.payerCpf, nome: params.payerName },
    valor: { original: params.amount.toFixed(2) },
    chave: params.pixKey,
    solicitacaoPagador: params.description.slice(0, 140),
  })

  const { status, data } = await mtlsRequest(params, {
    method: 'POST',
    path: '/v2/cob',
    headers: { Authorization: `Bearer ${params.accessToken}` },
    body,
  })

  if (status !== 200 && status !== 201) {
    console.error('[efi][pix] erro ao criar cobrança', { status, data })
    throw new Error(`[efi][pix] Falha ao criar cobrança: ${JSON.stringify(data).slice(0, 500)}`)
  }

  return {
    txid: data.txid,
    pixCopiaECola: data.pixCopiaECola,
    location: data.location ?? data.loc?.location,
    status: data.status,
  }
}

interface ConfigureWebhookParams extends PixMtlsCredentials {
  accessToken: string
  pixKey: string
  webhookUrl: string
}

/**
 * Registra o webhook da chave Pix. Usamos x-skip-mtls-checking: true porque
 * nosso servidor (Vercel) não expõe verificação de certificado cliente no
 * nível de socket — a Efí permite desligar essa exigência por webhook.
 */
export async function configurePixWebhook(params: ConfigureWebhookParams): Promise<void> {
  const { status, data } = await mtlsRequest(params, {
    method: 'PUT',
    path: `/v2/webhook/${encodeURIComponent(params.pixKey)}`,
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'x-skip-mtls-checking': 'true',
    },
    body: JSON.stringify({ webhookUrl: params.webhookUrl }),
  })

  if (status !== 200 && status !== 201) {
    throw new Error(`[efi][pix] Falha ao configurar webhook: ${JSON.stringify(data).slice(0, 500)}`)
  }
}
