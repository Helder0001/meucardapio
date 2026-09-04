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
import { prisma } from '@/lib/db/client'
import { decrypt } from '@/lib/security/crypto'

interface TenantPixChargeParams {
  tenantId: string
  orderId: string
  amount: number
  payerCpf?: string
  payerName: string
  description: string
  expirationSeconds?: number
}

export interface TenantPixChargeResult {
  txid: string
  pixCopiaECola: string
  pixQrCodeImage: string | null
}

/**
 * Busca as credenciais da Efí do tenant no banco (descriptografadas),
 * autentica e cria a cobrança — usado por actions/orders/create-order.ts
 * quando o tenant escolheu Efí como provedor de Pix.
 */
export async function createTenantPixCharge(params: TenantPixChargeParams): Promise<TenantPixChargeResult> {
  const connection = await prisma.efiConnection.findFirst({
    where: { tenantId: params.tenantId, revokedAt: null, pixKey: { not: null } },
  })

  if (!connection || !connection.pixCertificateEnc || !connection.pixKey) {
    throw new Error('Efí Pix não configurado para este estabelecimento')
  }

  const clientId = decrypt(connection.clientIdEnc)
  const clientSecret = decrypt(connection.clientSecretEnc)
  const pfx = Buffer.from(decrypt(connection.pixCertificateEnc), 'base64')
  const passphrase = connection.pixCertificatePassphraseEnc ? decrypt(connection.pixCertificatePassphraseEnc) : ''

  const creds = { clientId, clientSecret, pfx, passphrase, sandbox: connection.sandbox }

  const auth = await authorizePixApi(creds)
  if (!auth.ok) {
    throw new Error(`Efí Pix: ${auth.error}`)
  }

  const charge = await createImmediatePixCharge({
    ...creds,
    accessToken: auth.accessToken,
    pixKey: connection.pixKey,
    amount: params.amount,
    payerCpf: params.payerCpf,
    payerName: params.payerName,
    description: params.description,
    expirationSeconds: params.expirationSeconds,
  })

  const pixQrCodeImage = charge.locationId
    ? await getPixQrCodeImage({ ...creds, accessToken: auth.accessToken }, String(charge.locationId))
    : null

  return {
    txid: charge.txid,
    pixCopiaECola: charge.pixCopiaECola,
    pixQrCodeImage,
  }
}

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
  payerCpf?: string
  payerName: string
  description: string
  expirationSeconds?: number
}

export async function createImmediatePixCharge(params: CreateChargeParams): Promise<{
  txid: string
  pixCopiaECola: string
  location: string
  locationId: number | null
  status: string
}> {
  const body = JSON.stringify({
    calendario: { expiracao: params.expirationSeconds ?? 3600 },
    // `devedor` é opcional na API da Efí — quando o cliente não informou
    // CPF no checkout, a cobrança é criada sem identificar o pagador em
    // vez de mandar um CPF vazio/inválido (que a Efí rejeitaria).
    ...(params.payerCpf ? { devedor: { cpf: params.payerCpf, nome: params.payerName } } : {}),
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
    locationId: data.loc?.id ?? null,
    status: data.status,
  }
}

/** Busca a imagem do QR code (base64) a partir do location retornado na criação da cobrança. */
export async function getPixQrCodeImage(
  creds: PixMtlsCredentials & { accessToken: string },
  locationId: string
): Promise<string | null> {
  try {
    const { status, data } = await mtlsRequest(creds, {
      method: 'GET',
      path: `/v2/loc/${locationId}/qrcode`,
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    })
    if (status !== 200) return null
    // imagemQrcode vem como data URL completo ("data:image/png;base64,...")
    // — o frontend (order-tracking.tsx, order-detail.tsx) já monta esse
    // prefixo sozinho a partir do base64 puro, igual faz com o do MP.
    const dataUrl: string | undefined = data?.imagemQrcode
    return dataUrl?.includes(',') ? dataUrl.split(',')[1] : dataUrl ?? null
  } catch (err) {
    console.error('[efi][pix] erro ao buscar QR code', String(err))
    return null
  }
}

export interface TenantPixChargeStatus {
  status: string // 'ATIVA' | 'CONCLUIDA' | 'REMOVIDA_PELO_USUARIO_RECEBEDOR' | 'REMOVIDA_PELO_PSP'
  valorOriginal: string
  pix: Array<{ endToEndId: string; valor: string; horario: string }>
}

/**
 * VULN-CRIT-01 CORRIGIDO: os handlers de webhook (app/api/webhooks/efi-pix/*)
 * marcavam o Payment como PAID confiando cegamente no corpo do POST
 * recebido — sem nenhuma validação de assinatura/mTLS (o próprio endpoint
 * é registrado com x-skip-mtls-checking: true). Como o txid de cada
 * cobrança é devolvido ao próprio cliente no checkout (dentro do
 * pixCopiaECola), isso permitia forjar a confirmação de pagamento.
 *
 * Esta função consulta a cobrança diretamente na Efí (GET /v2/cob/:txid,
 * autenticado com o client credentials + certificado mTLS do tenant) para
 * confirmar a existência e o status real do pagamento antes de qualquer
 * webhook recebido ser usado para liberar um pedido — o corpo do webhook
 * passa a servir só de "sinal" pra saber qual txid consultar, nunca como
 * fonte de verdade.
 */
export async function getTenantPixChargeStatus(tenantId: string, txid: string): Promise<TenantPixChargeStatus> {
  const connection = await prisma.efiConnection.findFirst({
    where: { tenantId, revokedAt: null, pixKey: { not: null } },
  })

  if (!connection || !connection.pixCertificateEnc || !connection.pixKey) {
    throw new Error('Efí Pix não configurado para este estabelecimento')
  }

  const clientId = decrypt(connection.clientIdEnc)
  const clientSecret = decrypt(connection.clientSecretEnc)
  const pfx = Buffer.from(decrypt(connection.pixCertificateEnc), 'base64')
  const passphrase = connection.pixCertificatePassphraseEnc ? decrypt(connection.pixCertificatePassphraseEnc) : ''
  const creds = { clientId, clientSecret, pfx, passphrase, sandbox: connection.sandbox }

  const auth = await authorizePixApi(creds)
  if (!auth.ok) {
    throw new Error(`Efí Pix: ${auth.error}`)
  }

  const { status, data } = await mtlsRequest(creds, {
    method: 'GET',
    path: `/v2/cob/${encodeURIComponent(txid)}`,
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  })

  if (status !== 200) {
    throw new Error(`[efi][pix] Falha ao consultar cobrança ${txid} na Efí (status ${status}): ${JSON.stringify(data).slice(0, 500)}`)
  }

  return {
    status: data?.status ?? 'DESCONHECIDO',
    valorOriginal: data?.valor?.original ?? '0',
    pix: Array.isArray(data?.pix)
      ? data.pix.map((p: any) => ({
          endToEndId: p.endToEndId,
          valor: p.valor,
          horario: p.horario,
        }))
      : [],
  }
}

/**
 * Consulta na própria Efí qual URL de webhook está registrada pra essa
 * chave Pix agora — usado só como diagnóstico (GET /v2/webhook/:chave),
 * pra confirmar se o registro feito em configurePixWebhook realmente
 * "colou" do lado da Efí, sem precisar confiar cegamente no retorno 200
 * da chamada de registro.
 */
export async function getPixWebhookConfig(
  params: PixMtlsCredentials & { accessToken: string; pixKey: string }
): Promise<{ webhookUrl: string | null; raw: any }> {
  const { status, data } = await mtlsRequest(params, {
    method: 'GET',
    path: `/v2/webhook/${encodeURIComponent(params.pixKey)}`,
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'x-skip-mtls-checking': 'true',
    },
  })

  if (status === 404) return { webhookUrl: null, raw: data } // nenhum webhook registrado
  if (status !== 200) {
    throw new Error(`[efi][pix] Falha ao consultar webhook: ${JSON.stringify(data).slice(0, 500)}`)
  }

  return { webhookUrl: data?.webhookUrl ?? null, raw: data }
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

interface RefundTenantPixParams {
  tenantId: string
  e2eId: string
  amount: number // em reais
  devolutionId?: string // opcional — gerado por nós se não vier
}

/**
 * Estorna (devolve) um Pix recebido — PUT /v2/pix/:e2eId/devolucao/:id.
 * Diferente do refund de cartão, aqui o "id" da devolução é gerado por
 * NÓS (não pela Efí) e precisa ser único por e2eId; usamos um cuid curto
 * se quem chamou não passar um. `valor` vai como string decimal em reais
 * (não centavos — diferente do resto da API de Cobranças).
 */
export async function refundTenantPixPayment(params: RefundTenantPixParams): Promise<{ status: string; rtrId?: string }> {
  const connection = await prisma.efiConnection.findFirst({
    where: { tenantId: params.tenantId, revokedAt: null, pixKey: { not: null } },
  })
  if (!connection || !connection.pixCertificateEnc || !connection.pixKey) {
    throw new Error('Efí Pix não configurado para este estabelecimento')
  }

  const clientId = decrypt(connection.clientIdEnc)
  const clientSecret = decrypt(connection.clientSecretEnc)
  const pfx = Buffer.from(decrypt(connection.pixCertificateEnc), 'base64')
  const passphrase = connection.pixCertificatePassphraseEnc ? decrypt(connection.pixCertificatePassphraseEnc) : ''
  const creds = { clientId, clientSecret, pfx, passphrase, sandbox: connection.sandbox }

  const auth = await authorizePixApi(creds)
  if (!auth.ok) {
    throw new Error(`Efí Pix: ${auth.error}`)
  }

  const devolutionId = params.devolutionId ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

  const { status, data } = await mtlsRequest(creds, {
    method: 'PUT',
    path: `/v2/pix/${encodeURIComponent(params.e2eId)}/devolucao/${encodeURIComponent(devolutionId)}`,
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    body: JSON.stringify({ valor: params.amount.toFixed(2) }),
  })

  if (status !== 200 && status !== 201) {
    console.error('[efi][pix] erro ao estornar', { status, data })
    throw new Error(`[efi][pix] Falha ao solicitar devolução: ${JSON.stringify(data).slice(0, 500)}`)
  }

  return { status: data?.status ?? 'EM_PROCESSAMENTO', rtrId: data?.rtrId }
}
