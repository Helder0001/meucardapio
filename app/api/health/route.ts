// app/api/health/route.ts
// Endpoint de healthcheck para monitoramento externo (UptimeRobot, BetterUptime, etc.)
// Verifica: banco de dados, Redis e configurações críticas.
// Não expõe dados sensíveis — apenas status operacional.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { redis } from '@/lib/cache/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CheckResult {
  ok: boolean
  latencyMs?: number
  error?: string
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err: any) {
    return { ok: false, error: 'database unreachable' }
  }
}

async function checkRedis(): Promise<CheckResult> {
  const start = Date.now()
  try {
    await redis.ping()
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err: any) {
    return { ok: false, error: 'redis unreachable' }
  }
}

function checkEnvVars(): CheckResult {
  const required = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'ENCRYPTION_KEY',
    'OTP_SALT',
    'ORDER_TOKEN_SECRET',
  ]
  const missing = required.filter((k) => !process.env[k])
  if (missing.length > 0) {
    return { ok: false, error: `missing env vars: ${missing.join(', ')}` }
  }
  return { ok: true }
}

export async function GET(request: Request) {
  // Healthcheck detalhado apenas para chamadas internas (com CRON_SECRET)
  // Chamadas externas recebem apenas status 200/503
  const secret = request.headers.get('x-cron-secret')
  const isInternal = secret === process.env.CRON_SECRET

  const [db, cache, env] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    Promise.resolve(checkEnvVars()),
  ])

  const allOk = db.ok && cache.ok && env.ok

  if (isInternal) {
    return NextResponse.json(
      {
        status: allOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        checks: { database: db, redis: cache, env },
        version: process.env.npm_package_version ?? 'unknown',
      },
      { status: allOk ? 200 : 503 }
    )
  }

  // Resposta pública mínima — não expõe detalhes internos
  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded' },
    { status: allOk ? 200 : 503 }
  )
}
