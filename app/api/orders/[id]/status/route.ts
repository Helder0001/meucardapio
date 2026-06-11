// app/api/orders/[id]/status/route.ts
//
// VULN-NEW-03 CORRIGIDO: endpoint de polling de status do pedido (usado pelo
// storefront após checkout) agora exige um token HMAC curto para autorizar
// o acesso, sem exigir login do cliente final.
//
// Fluxo seguro:
//   1. createOrderAction() gera um statusToken = HMAC-SHA256(orderId, ORDER_TOKEN_SECRET)
//      e o retorna junto com o orderId.
//   2. O frontend armazena o token apenas em memória (não no localStorage).
//   3. Ao fazer polling, envia ?token=<statusToken>.
//   4. Este endpoint valida o token antes de retornar qualquer dado.
//
// Usuários autenticados do dashboard (TENANT_ADMIN, MANAGER etc.) continuam
// acessando via session JWT — não precisam do token.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import crypto from 'crypto'

function generateStatusToken(orderId: string): string {
  const secret = process.env.ORDER_TOKEN_SECRET ?? process.env.AUTH_SECRET ?? ''
  return crypto.createHmac('sha256', secret).update(orderId).digest('hex')
}

function validateStatusToken(orderId: string, token: string): boolean {
  const expected = generateStatusToken(orderId)
  if (expected.length !== token.length) return false
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(token,    'hex'),
    )
  } catch {
    return false
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    // Opção A: usuário autenticado do dashboard (TENANT_ADMIN, MANAGER etc.)
    const session = await auth()
    const isAuthenticatedStaff = !!(session?.user?.tenantId)

    // Opção B: cliente do storefront com token HMAC válido
    const hasValidToken = token ? validateStatusToken(id, token) : false

    if (!isAuthenticatedStaff && !hasValidToken) {
      // Retornar 404 em vez de 401 para não confirmar a existência do pedido
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Se autenticado como staff, garantir que o pedido pertence ao tenant
    const tenantFilter = isAuthenticatedStaff
      ? { tenantId: session!.user.tenantId! }
      : {}

    const order = await prisma.order.findFirst({
      where: { id, ...tenantFilter },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        confirmedAt: true,
        readyAt: true,
        deliveredAt: true,
        payments: {
          where: { method: 'PIX' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            pixQrCode: true,
            pixQrCodeBase64: true,
            pixExpiresAt: true,
            amount: true,
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Não retornar QR Code de PIX expirado
    const now = new Date()
    const payments = order.payments.map((p) => ({
      status: p.status,
      amount: Number(p.amount),
      pixExpiresAt: p.pixExpiresAt,
      // QR Code só é retornado enquanto válido e o pagamento está pendente
      pixQrCode: (p.pixExpiresAt && p.pixExpiresAt > now && p.status === 'PENDING')
        ? p.pixQrCode
        : null,
      pixQrCodeBase64: (p.pixExpiresAt && p.pixExpiresAt > now && p.status === 'PENDING')
        ? p.pixQrCodeBase64
        : null,
    }))

    return NextResponse.json({
      status: order.status,
      paymentStatus: order.paymentStatus,
      confirmedAt: order.confirmedAt,
      readyAt: order.readyAt,
      deliveredAt: order.deliveredAt,
      payments,
    })
  } catch (error) {
    console.error('[orders/status] Erro interno:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Exportar o helper para uso em createOrderAction
export { generateStatusToken }
