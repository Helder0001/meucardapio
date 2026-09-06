// lib/monitoring/health-checks.ts
//
// Extraído de app/api/health/route.ts pra poder ser chamado direto pela
// página de Monitoramento (app/(master)/master/monitoring) sem precisar
// dar um fetch HTTP nela mesma — mais rápido e sem depender de montar a
// URL absoluta do próprio deploy dentro de uma function serverless.

import { prisma } from '@/lib/db/client'
import { redis } from '@/lib/cache/redis'

export interface CheckResult {
  ok: boolean
  latencyMs?: number
  error?: string
}

export async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - start }
  } catch {
    return { ok: false, error: 'database unreachable' }
  }
}

export async function checkRedis(): Promise<CheckResult> {
  const start = Date.now()
  try {
    await redis.ping()
    return { ok: true, latencyMs: Date.now() - start }
  } catch {
    return { ok: false, error: 'redis unreachable' }
  }
}

export function checkEnvVars(): CheckResult {
  const required = ['DATABASE_URL', 'ENCRYPTION_KEY', 'OTP_SALT', 'ORDER_TOKEN_SECRET']
  const missing = required.filter((k) => !process.env[k])
  if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
    missing.push('AUTH_SECRET (ou NEXTAUTH_SECRET)')
  }
  if (missing.length > 0) {
    return { ok: false, error: `missing env vars: ${missing.join(', ')}` }
  }
  return { ok: true }
}

export interface HealthReport {
  ok: boolean
  database: CheckResult
  redis: CheckResult
  env: CheckResult
}

export async function runHealthChecks(): Promise<HealthReport> {
  const [database, redisResult, env] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    Promise.resolve(checkEnvVars()),
  ])
  return { ok: database.ok && redisResult.ok && env.ok, database, redis: redisResult, env }
}
