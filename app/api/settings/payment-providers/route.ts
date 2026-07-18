// app/api/settings/payment-providers/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: session.user.tenantId },
    select: { settings: true },
  })

  const paymentProviders = (tenant?.settings as any)?.paymentProviders ?? {}

  return NextResponse.json({
    pix: paymentProviders.pix ?? 'MERCADOPAGO',
    card: paymentProviders.card ?? 'MERCADOPAGO',
  })
}
