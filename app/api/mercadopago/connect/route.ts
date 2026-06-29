// app/api/mercadopago/connect/route.ts
//
// Inicia a conexão OAuth do tenant com o Mercado Pago. O lojista é
// redirecionado para a tela de autorização do MP, loga com a CONTA DELE
// (não a da plataforma) e autoriza o acesso. Depois disso, os pagamentos
// PIX/cartão dos clientes do restaurante caem direto na conta dele.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { auth } from '@/lib/auth/session'
import { generatePkcePair, buildAuthorizationUrl } from '@/lib/mercadopago/oauth-client'
import { setOAuthHandshakeCookie } from '@/lib/mercadopago/oauth-state-cookie'

export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para gerenciar pagamentos' }, { status: 403 })
  }

  if (!process.env.MERCADOPAGO_CLIENT_ID || !process.env.MERCADOPAGO_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Integração com Mercado Pago Connect ainda não configurada nesta plataforma.' },
      { status: 503 }
    )
  }

  const state = crypto.randomBytes(24).toString('hex')
  const { codeVerifier, codeChallenge } = generatePkcePair()
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/mercadopago/callback`

  await setOAuthHandshakeCookie({ state, codeVerifier, tenantId: session.user.tenantId })

  const authorizationUrl = buildAuthorizationUrl({ state, codeChallenge, redirectUri })

  return NextResponse.json({ authorizationUrl })
}
