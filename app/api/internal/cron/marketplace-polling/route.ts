// app/api/internal/cron/marketplace-polling/route.ts
//
// Cron que faz o polling de eventos do iFood e 99Food para todas as
// conexões ativas. Configurar na Vercel (vercel.json) para rodar a cada
// 1 minuto — ver DEPLOY.md para o passo a passo de crons.

import { NextResponse } from 'next/server'
import { pollAllConnections } from '@/lib/marketplace/poll-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const legacySecret = request.headers.get('x-cron-secret')

  const expected = process.env.CRON_SECRET
  if (!expected || (bearerToken !== expected && legacySecret !== expected)) {
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
