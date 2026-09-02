// app/api/internal/cron/marketplace-polling/route.ts
//
// Cron que faz o polling de eventos do iFood e 99Food para todas as
// conexões ativas. Configurar na Vercel (vercel.json) para rodar a cada
// 1 minuto — ver DEPLOY.md para o passo a passo de crons.

import { NextResponse } from 'next/server'
import { pollAllConnections } from '@/lib/marketplace/poll-events'
import { isValidCronSecretHeader } from '@/lib/security/cron-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  // VULN-BAIXA-07 CORRIGIDO: comparação direta (!==) trocada por
  // isValidCronSecretHeader(), que usa crypto.timingSafeEqual — mesmo
  // padrão agora usado nos 4 endpoints de cron.
  if (!isValidCronSecretHeader(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await pollAllConnections()
    const totalEvents = results.reduce((sum, r) => sum + r.eventsReceived, 0)
    const totalOrders = results.reduce((sum, r) => sum + r.ordersProcessed, 0)
    const errors = results.filter((r) => r.error)

    return NextResponse.json({
      ok: true,
      connectionsPolled: results.length,
      totalEvents,
      totalOrders,
      errors,
    })
  } catch (err) {
    console.error('[cron/marketplace-polling]', err)
    return NextResponse.json({ error: 'Falha ao executar polling' }, { status: 500 })
  }
}
