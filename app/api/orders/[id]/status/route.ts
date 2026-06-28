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
import { restockCancelledOrder } from '@/lib/utils/stock'
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
        tenantId: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
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

    const PENDING_PAYMENT_TIMEOUT_MS = 2 * 60 * 60 * 1000 // 2 horas

    // CORREÇÃO: cancelar automaticamente quando o PIX expira, sem depender só
    // do webhook do MP (que pode demorar/falhar) nem do cron diário (no plano
    // Hobby da Vercel só roda 1x/dia — muito lento pra uma janela de 5min).
    const expiredPix = order.payments[0]
    const pixExpired = !!(
      order.status === 'PENDING' &&
      expiredPix?.status === 'PENDING' &&
      expiredPix.pixExpiresAt &&
      expiredPix.pixExpiresAt < new Date()
    )

    // Regra geral: qualquer pedido PENDING sem pagamento confirmado há mais
    // de 2h é cancelado. Roda aqui (a cada vez que o cliente consulta o
    // status) porque o plano Hobby da Vercel só permite cron 1x/dia — não dá
    // pra confiar só no cron pra cumprir a janela de 2h. O cron diário fica
    // como rede de segurança para pedidos cujo cliente nunca voltou a
    // consultar o status (ex.: fechou a aba).
    const paymentTimedOut = !!(
      order.status === 'PENDING' &&
      order.paymentStatus === 'PENDING' &&
      Date.now() - order.createdAt.getTime() > PENDING_PAYMENT_TIMEOUT_MS
    )

    if (pixExpired || paymentTimedOut) {
      const cancelReason = pixExpired
        ? 'PIX expirado sem pagamento'
        : 'Cancelamento automático por falta de pagamento (2h)'
      const historyNote = pixExpired
        ? 'Cancelamento automático: PIX expirado sem pagamento'
        : 'Cancelamento automático: pagamento pendente há mais de 2 horas'

      await prisma.$transaction(async (tx) => {
        // Só cancela se ainda estiver PENDING no momento exato da transação
        // (evita corrida com o webhook do MP ou outra consulta concorrente).
        const updated = await tx.order.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            status: 'CANCELLED',
            paymentStatus: pixExpired ? 'FAILED' : order.paymentStatus,
            cancelledAt: new Date(),
            cancelReason,
          },
        })
        if (updated.count === 0) return // outra rotina já tratou este pedido

        if (pixExpired) {
          await tx.payment.updateMany({
            where: { orderId: id, method: 'PIX', status: 'PENDING' },
            data: { status: 'FAILED', failedAt: new Date() },
          })
        }
        await tx.orderStatusHistory.create({
          data: { orderId: id, status: 'CANCELLED', notes: historyNote },
        })
        // Devolve ao estoque tudo que foi debitado na criação do pedido
        await restockCancelledOrder(tx, { tenantId: order.tenantId, orderId: id })
      })

      order.status = 'CANCELLED'
      if (pixExpired) {
        order.paymentStatus = 'FAILED'
        if (order.payments[0]) order.payments[0].status = 'FAILED'
      }
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
