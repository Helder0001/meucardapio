// app/api/stripe/connect/route.ts
//
// Inicia a conexão OAuth do tenant com o Stripe Connect. Mesmo padrão do
// /api/mercadopago/connect.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { auth } from '@/lib/auth/session'
import { buildAuthorizationUrl } from '@/lib/stripe/oauth-client'
import { setStripeOAuthHandshakeCookie } from '@/lib/stripe/oauth-state-cookie'

export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para gerenciar pagamentos' }, { status: 403 })
  }

  if (!process.env.STRIPE_CONNECT_CLIENT_ID || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Integração com Stripe Connect ainda não configurada nesta plataforma.' },
      { status: 503 }
    )
  }

  const state = crypto.randomBytes(24).toString('hex')
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/callback`

  await setStripeOAuthHandshakeCookie({ state, tenantId: session.user.tenantId })

  const authorizationUrl = buildAuthorizationUrl({ state, redirectUri })

  return NextResponse.json({ authorizationUrl })
}
