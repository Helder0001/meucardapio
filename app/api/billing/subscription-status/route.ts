// app/api/billing/subscription-status/route.ts
//
// Endpoint leve pra polling do client depois de submeter o cartão em
// /assinatura. Sem ele, o formulário teria que redirecionar "no escuro"
// pro /dashboard e torcer pra já estar ACTIVE — o que falha sempre que o
// Mercado Pago demora pra aprovar a cobrança (status "Processando"),
// porque o /dashboard bloqueia e manda de volta, causando loop de
// carregamento.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: 'Estabelecimento não encontrado' }, { status: 404 })
  }

  const trialExpired =
    tenant.subscriptionStatus === 'TRIAL' &&
    !!tenant.trialEndsAt &&
    tenant.trialEndsAt < new Date()

  const hasValidAccess =
    tenant.subscriptionStatus === 'ACTIVE' ||
    (tenant.subscriptionStatus === 'TRIAL' && !trialExpired)

  return NextResponse.json({ status: tenant.subscriptionStatus, hasValidAccess })
}
