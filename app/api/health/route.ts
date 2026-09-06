// app/api/health/route.ts
// Endpoint de healthcheck para monitoramento externo (Sentry Uptime Monitoring,
// UptimeRobot, BetterUptime, etc.) — aponte um monitor externo pra essa URL.
// Verifica: banco de dados, Redis e configurações críticas.
// Não expõe dados sensíveis — apenas status operacional.
//
// A lógica de checagem mora em lib/monitoring/health-checks.ts, reaproveitada
// também pela página app/(master)/master/monitoring (ver lá).

import { NextResponse } from 'next/server'
import { runHealthChecks } from '@/lib/monitoring/health-checks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Healthcheck detalhado apenas para chamadas internas (com CRON_SECRET)
  // Chamadas externas recebem apenas status 200/503
  const secret = request.headers.get('x-cron-secret')
  const isInternal = secret === process.env.CRON_SECRET

  const report = await runHealthChecks()

  if (isInternal) {
    return NextResponse.json(
      {
        status: report.ok ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        checks: { database: report.database, redis: report.redis, env: report.env },
        version: process.env.npm_package_version ?? 'unknown',
      },
      { status: report.ok ? 200 : 503 }
    )
  }

  // Resposta pública mínima — não expõe detalhes internos
  return NextResponse.json(
    { status: report.ok ? 'ok' : 'degraded' },
    { status: report.ok ? 200 : 503 }
  )
}
