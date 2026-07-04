// app/api/mercadopago/status/route.ts
//
// Retorna o estado da conexão MP do tenant para a tela de pagamentos.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const connection = await prisma.mercadoPagoConnection.findFirst({
    where: { tenantId: session.user.tenantId },
    select: {
      mpUserId: true,
      liveMode: true,
      publicKey: true,
      connectedAt: true,
      lastRefreshedAt: true,
      revokedAt: true,
      scope: true,
    },
  })

  const tenant = await prisma.tenant.findFirst({
    where: { id: session.user.tenantId },
    select: { settings: true },
  })
  const hasLegacyToken = !!(tenant?.settings as any)?.mercadoPagoAccessToken

  const isConnected = !!connection && !connection.revokedAt

  // Diagnóstico mais confiável que liveMode: a convenção do Mercado Pago é
  // que toda public key/access token começa com "TEST-" (sandbox) ou
  // "APP_USR-" (produção) — isso nunca falha, diferente do campo live_mode
  // que depende de termos capturado certo na hora de conectar.
  const isTestKey = connection?.publicKey?.startsWith('TEST-') ?? null

  // Só o suficiente pra você confirmar visualmente qual conta está
  // conectada, sem expor a chave inteira (ela é pública, mas ainda assim).
  const publicKeyPreview = connection?.publicKey
    ? `${connection.publicKey.slice(0, 12)}...${connection.publicKey.slice(-6)}`
    : null

  return NextResponse.json({
    connected: isConnected,
    mpUserId: connection?.mpUserId ?? null,
    liveMode: connection?.liveMode ?? null,
    isTestKey,
    publicKeyPreview,
    connectedAt: connection?.connectedAt ?? null,
    hasLegacyToken,
  })
}
