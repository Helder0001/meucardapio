// lib/security/internal-secret.ts
//
// Secret usado para autenticar chamadas HTTP que o PRÓPRIO servidor faz a
// si mesmo (ex.: actions/auth/register.ts chamando /api/mp/preapproval).
// Essas rotas não devem ser alcançáveis por ninguém de fora — derivamos o
// secret via HMAC em vez de exigir mais uma env var nova pra configurar.

import crypto from 'crypto'

export function getInternalApiSecret(): string {
  const base = process.env.ORDER_TOKEN_SECRET ?? process.env.AUTH_SECRET ?? ''
  return crypto.createHmac('sha256', base).update('internal-api-v1').digest('hex')
}

export function isValidInternalSecret(provided: string | null | undefined): boolean {
  if (!provided) return false
  const expected = getInternalApiSecret()
  if (expected.length !== provided.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'))
  } catch {
    return false
  }
}
