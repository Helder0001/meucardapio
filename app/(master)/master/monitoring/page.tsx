// app/(master)/master/monitoring/page.tsx
//
// Painel técnico: status ao vivo (banco/Redis/env vars), erros recentes
// (via Sentry Issues API) e orientação pra ligar um uptime monitor de
// verdade (externo — ver comentário em app/api/health/route.ts sobre por
// que isso não pode ser um cron rodando na própria Vercel).

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { runHealthChecks } from '@/lib/monitoring/health-checks'
import { getRecentSentryIssues } from '@/lib/monitoring/sentry-api'
import { formatRelative } from '@/lib/utils/format'
import { CheckCircle2, XCircle, AlertTriangle, ExternalLink, Database, Server, KeyRound } from 'lucide-react'

export const metadata: Metadata = { title: 'Monitoramento — Master' }
export const revalidate = 0 // sempre ao vivo, nunca cacheado

function StatusPill({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-emerald-600 bg-emerald-500/10">
      <CheckCircle2 className="h-3.5 w-3.5" /> OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-destructive bg-destructive/10">
      <XCircle className="h-3.5 w-3.5" /> Falhou
    </span>
  )
}

const LEVEL_COLOR: Record<string, string> = {
  fatal: 'text-destructive',
  error: 'text-destructive',
  warning: 'text-amber-600',
  info: 'text-muted-foreground',
}

export default async function MonitoringPage() {
  const session = await auth()
  if (session?.user?.role !== 'MASTER_ADMIN') redirect('/login')

  const [health, sentry] = await Promise.all([
    runHealthChecks(),
    getRecentSentryIssues(),
  ])

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Monitoramento</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status técnico do SaaS — atualizado a cada carregamento da página.
        </p>
      </div>

      {/* Status ao vivo */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Status agora</h2>
          <StatusPill ok={health.ok} />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
            <Database className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Banco de dados</p>
              <p className="text-xs text-muted-foreground">
                {health.database.ok ? `${health.database.latencyMs}ms` : health.database.error}
              </p>
            </div>
            <StatusPill ok={health.database.ok} />
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
            <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Redis (cache)</p>
              <p className="text-xs text-muted-foreground">
                {health.redis.ok ? `${health.redis.latencyMs}ms` : health.redis.error}
              </p>
            </div>
            <StatusPill ok={health.redis.ok} />
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
            <KeyRound className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Variáveis de ambiente</p>
              <p className="text-xs text-muted-foreground">
                {health.env.ok ? 'todas presentes' : health.env.error}
              </p>
            </div>
            <StatusPill ok={health.env.ok} />
          </div>
        </div>
      </div>

      {/* Uptime — explicação + link, sem fingir que monitoramos sozinhos */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="font-semibold text-foreground">Uptime (site no ar)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          O card acima só mostra o status de agora, no momento em que você abre essa página —
          não é vigilância contínua. Pra ser avisado automaticamente se o site cair (mesmo
          com ninguém olhando essa tela), configure um monitor <strong>externo</strong> apontando
          pra <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/api/health</code>:
          ele precisa rodar fora da Vercel, senão para de checar junto se a Vercel cair.
        </p>
        <a
          href={
            process.env.SENTRY_ORG
              ? `https://${process.env.SENTRY_ORG}.sentry.io/alerts/rules/uptime/`
              : 'https://docs.sentry.io/product/alerts/uptime-monitoring/'
          }
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Configurar Uptime Monitor no Sentry <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Erros recentes (Sentry) */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Erros recentes (últimas 24h)</h2>
          {process.env.SENTRY_ORG && (
            <a
              href={`https://${process.env.SENTRY_ORG}.sentry.io/issues/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              Ver tudo no Sentry <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {!sentry.configured ? (
          <p className="text-sm text-muted-foreground">
            Configure <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SENTRY_ORG</code>,{' '}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SENTRY_PROJECT</code> e{' '}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SENTRY_AUTH_TOKEN</code> na
            Vercel pra ver os erros aqui.
          </p>
        ) : sentry.error ? (
          <p className="text-sm text-destructive">{sentry.error}</p>
        ) : sentry.issues.length === 0 ? (
          <p className="text-sm text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Nenhum erro não resolvido nas últimas 24h.
          </p>
        ) : (
          <div className="space-y-1">
            {sentry.issues.map((issue) => (
              <a
                key={issue.id}
                href={issue.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{issue.title}</p>
                  {issue.where && (
                    <p className="text-xs text-muted-foreground truncate">{issue.where}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-xs font-semibold uppercase ${LEVEL_COLOR[issue.level] ?? 'text-muted-foreground'}`}>
                    {issue.level} · {issue.count}x
                  </p>
                  <p className="text-xs text-muted-foreground">{formatRelative(issue.lastSeen)}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
