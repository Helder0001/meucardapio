// app/api/storefront/[slug]/mp-public-key/route.ts
//
// Retorna a Public Key do Mercado Pago do TENANT (não a da plataforma) para
// o storefront poder inicializar o MP.js e tokenizar o cartão no browser do
// cliente final. Public Key não é sensível — é projetada para uso público
// no frontend (o nome já diz: "public").

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const tenant = await prisma.tenant.findFirst({
    where: { slug },
    select: { id: true, settings: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
  }

  const connection = await prisma.mercadoPagoConnection.findFirst({
    where: { tenantId: tenant.id, revokedAt: null },
    select: { publicKey: true },
  })

  const publicKey = connection?.publicKey
    ?? (tenant.settings as any)?.mercadoPagoPublicKey
    ?? process.env.NEXT_PUBLIC_MP_PUBLIC_KEY
    ?? null

  if (!publicKey) {
    return NextResponse.json({ error: 'Pagamento com cartão não disponível para esta loja' }, { status: 404 })
  }

  return NextResponse.json({ publicKey })
}
