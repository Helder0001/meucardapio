// lib/security/cron-auth.ts
//
// VULN-BAIXA-07 CORRIGIDO: a verificação do CRON_SECRET estava duplicada
// em 4 arquivos diferentes (app/api/internal/cron/cleanup,
// marketplace-polling, subscription-check, e app/api/cron/reports) e só
// UM deles (subscription-check) usava comparação timing-safe
// (crypto.timingSafeEqual) — os outros três comparavam com `!==` puro.
// Extraído aqui pra existir um único lugar certo, usado por todos.
//
// A Vercel envia o CRON_SECRET automaticamente como
// "Authorization: Bearer <CRON_SECRET>" para crons definidos em
// vercel.json — é assim que ela autentica execuções agendadas. Mantemos
// também o header legado "x-cron-secret" para chamadas manuais
// (curl/monitoramento externo), como já documentado em DEPLOY.md.

import crypto from 'crypto'

function timingSafeEqualStr(expected: string, provided: string): boolean {
  // Buffers de tamanho diferente fazem timingSafeEqual lançar — checar o
  // tamanho antes não reintroduz um timing attack útil aqui, porque o
  // tamanho do CRON_SECRET não é segredo (não muda por tentativa).
  if (expected.length !== provided.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  } catch {
    return false
  }
}

export function isValidCronSecretHeader(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false

  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const legacySecret = request.headers.get('x-cron-secret')

  if (bearerToken && timingSafeEqualStr(expected, bearerToken)) return true
  if (legacySecret && timingSafeEqualStr(expected, legacySecret)) return true
  return false
}
