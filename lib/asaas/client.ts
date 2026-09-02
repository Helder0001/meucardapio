// lib/asaas/client.ts
//
// Cliente HTTP do Asaas. Diferente do Mercado Pago/Stripe, o Asaas não usa
// OAuth — cada tenant cola a própria API Key (gerada no painel dele, em
// Integrações → Chaves de API) e ela é enviada em TODAS as chamadas no
// header `access_token` (não é "Authorization: Bearer", é um header próprio).
//
// Doc: https://docs.asaas.com/docs/autenticacao

import { prisma } from '@/lib/db/client'
import { encrypt, decrypt } from '@/lib/security/crypto'

const ASAAS_BASE_URL = 'https://api.asaas.com/v3'
const ASAAS_SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com/v3'

export class AsaasError extends Error {
  constructor(message: string, public status?: number, public details?: unknown) {
    super(message)
    this.name = 'AsaasError'
  }
}

// Busca a API Key do tenant (descriptografada) + a base URL certa —
// lança erro claro se o tenant não tiver conectado o Asaas.
export async function getAsaasCredentials(tenantId: string): Promise<{ apiKey: string; baseUrl: string }> {
  const connection = await prisma.asaasConnection.findFirst({
    where: { tenantId, revokedAt: null },
    select: { apiKeyEnc: true, environment: true },
  })
  if (!connection) throw new AsaasError('Asaas não conectado para este estabelecimento')

  return {
    apiKey: decrypt(connection.apiKeyEnc),
    baseUrl: connection.environment === 'sandbox' ? ASAAS_SANDBOX_BASE_URL : ASAAS_BASE_URL,
  }
}

// Faz uma chamada autenticada à API do Asaas em nome de um tenant.
export async function asaasRequest<T = any>(
  tenantId: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const { apiKey, baseUrl } = await getAsaasCredentials(tenantId)
  return asaasRequestWithKey<T>(apiKey, baseUrl, path, init)
}

// Mesma coisa, mas recebendo a API Key diretamente — usado no momento de
// CONECTAR (antes de existir uma linha em AsaasConnection pra buscar).
export async function asaasRequestWithKey<T = any>(
  apiKey: string,
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'MeuCardapio/1.0',
      access_token: apiKey,
      ...(init?.headers ?? {}),
    },
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const message = data?.errors?.[0]?.description || `Erro Asaas (${res.status})`
    throw new AsaasError(message, res.status, data)
  }

  return data as T
}

export { encrypt, decrypt }
