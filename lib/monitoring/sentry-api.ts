// lib/monitoring/sentry-api.ts
//
// Busca as issues (erros) recentes do projeto no Sentry pra exibir no
// painel de Monitoramento (app/(master)/master/monitoring). Usa só a
// API de Issues, que é estável e documentada — evitamos de propósito a
// API de Uptime Monitoring do Sentry porque ela ainda está em beta e o
// formato dela muda com frequência (viraria manutenção constante aqui).
// Uptime de verdade precisa de um vigia externo de qualquer forma (ver
// comentário em app/api/health/route.ts) — o Sentry Uptime Monitor
// nativo continua sendo a forma recomendada pra isso, configurado direto
// no painel do Sentry.

interface SentryIssue {
  id: string
  title: string
  culprit: string | null
  level: string
  count: string
  userCount: number
  firstSeen: string
  lastSeen: string
  permalink: string
  status: string
}

export interface MonitoringIssue {
  id: string
  title: string
  where: string | null
  level: string
  count: number
  lastSeen: string
  url: string
}

export interface SentryIssuesResult {
  configured: boolean
  error: string | null
  issues: MonitoringIssue[]
}

// Sentry roteia por subdomínio da organização desde 2024 (ex.:
// meucardapio.sentry.io) — usamos esse formato porque é o que aparece de
// fato na URL do painel, em vez do domínio genérico sentry.io que exige
// lógica extra de redirecionamento por região.
export async function getRecentSentryIssues(): Promise<SentryIssuesResult> {
  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT
  const token = process.env.SENTRY_AUTH_TOKEN

  if (!org || !project || !token) {
    return { configured: false, error: null, issues: [] }
  }

  const url = `https://${org}.sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&statsPeriod=24h&sort=freq&limit=10`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      // Nunca cachear monitoramento — precisa ser sempre o estado atual.
      cache: 'no-store',
    })

    if (!res.ok) {
      return {
        configured: true,
        error: `Sentry respondeu ${res.status} — confira SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN.`,
        issues: [],
      }
    }

    const data = (await res.json()) as SentryIssue[]
    return {
      configured: true,
      error: null,
      issues: data.map((issue) => ({
        id: issue.id,
        title: issue.title,
        where: issue.culprit,
        level: issue.level,
        count: Number(issue.count),
        lastSeen: issue.lastSeen,
        url: issue.permalink,
      })),
    }
  } catch {
    return { configured: true, error: 'Não foi possível conectar ao Sentry agora.', issues: [] }
  }
}
