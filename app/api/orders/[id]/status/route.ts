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
import { restockCancelledOrder, revalidateStorefrontForTenant } from '@/lib/utils/stock'
import { processEfiPixWebhookEntries } from '@/lib/efi/pix-webhook-handler'
import crypto from 'crypto'

function generateStatusToken(orderId: string): string {
  const secret = process.env.ORDER_TOKEN_SECRET ?? process.env.AUTH_SECRET ?? ''
  return crypto.createHmac('sha256', secret).update(orderId).digest('hex')
}

export function validateStatusToken(orderId: string, token: string): boolean {
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

    const orderSelect = {
      id: true,
      tenantId: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
      confirmedAt: true,
      readyAt: true,
      deliveredAt: true,
      type: true,
      courierLat: true,
      courierLng: true,
      courierUpdatedAt: true,
      deliveryLat: true,
      deliveryLng: true,
      tenant: { select: { latitude: true, longitude: true } },
      payments: {
        // BUG CORRIGIDO: filtro restrito a `method: 'PIX'` e `take: 1` fazia
        // sentido para o storefront (order-tracking.tsx só acompanha 1 PIX),
        // mas esse mesmo endpoint também é usado pelo polling do dashboard
        // (order-detail.tsx e kanban-new-order-button.tsx) para pagamentos
        // "cobrar no final" — que podem ter PIX *e* cartão via link, e podem
        // ter mais de um registro de pagamento (ex.: pagamento dividido).
        // Com `take: 1` só o PIX mais recente aparecia; um pagamento em
        // CREDIT_CARD (link) nunca era retornado aqui e ficava para sempre
        // como PENDING na tela até um reload manual.
        where: { method: { in: ['PIX', 'CREDIT_CARD'] as const } },
        orderBy: { createdAt: 'desc' as const },
        select: {
          id: true, // BUG CORRIGIDO: faltava o id do pagamento — order-detail.tsx
                     // casa a atualização do polling com `data.payments.find(dp =>
                     // dp.id === p.id)`; sem `id` no retorno, `dp.id` é sempre
                     // `undefined` e o `find` nunca casa com nada, então o pagamento
                     // PIX registrado via "cobrar no final" nunca saía de
                     // "Aguardando confirmação PIX" na tela, mesmo já pago (diferente
                     // do fluxo de PDV/balcão, que compara pelo `paymentStatus` do
                     // pedido como um todo em vez de por pagamento individual).
          status: true,
          method: true, // BUG CORRIGIDO: sem isso, o frontend (order-tracking.tsx)
                         // perde a referência de que é um pagamento PIX assim que o
                         // primeiro poll substitui o array de payments — a checagem
                         // `pendingPayment?.method === 'PIX'` vira false e o
                         // QR/copia-e-cola some da tela em ~5s (1º ciclo de polling).
          pixQrCode: true,
          pixQrCodeBase64: true,
          pixExpiresAt: true,
          checkoutUrl: true,
          amount: true,
          provider: true,
          providerReference: true,
        },
      },
    } as const

    let order = await prisma.order.findFirst({
      where: { id, ...tenantFilter },
      select: orderSelect,
    })

    if (!order) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // CORREÇÃO: um PIX via Efí só é confirmado quando a Efí notifica o
    // nosso webhook (app/api/webhooks/efi-pix/pix/route.ts) — mas esse
    // webhook depende de ter sido registrado corretamente pra chave Pix
    // do tenant (configurePixWebhook). Se esse cadastro nunca "colou" do
    // lado da Efí (falhou silenciosamente, foi feito antes de trocar de
    // chave, etc.), a notificação simplesmente nunca chega e a tela fica
    // presa em "Aguardando pagamento PIX" pra sempre — mesmo com o
    // cliente já tendo pago de verdade — porque não existia nenhum outro
    // lugar consultando a Efí proativamente. Agora, a cada poll de status
    // com um PIX Efí ainda PENDING (e ainda não expirado), consultamos a
    // cobrança direto na API da Efí como rede de segurança — mesma
    // checagem autoritativa (status CONCLUIDA + valor batendo) já usada
    // no próprio webhook, só que disparada por nós em vez de esperar a
    // notificação.
    const pendingEfiPix = order.payments.filter(
      (p) =>
        p.status === 'PENDING' &&
        p.method === 'PIX' &&
        p.provider === 'EFI' &&
        p.providerReference &&
        (!p.pixExpiresAt || p.pixExpiresAt > new Date())
    )
    if (pendingEfiPix.length > 0) {
      await processEfiPixWebhookEntries(
        pendingEfiPix.map((p) => ({ txid: p.providerReference as string }))
      )
      const refreshed = await prisma.order.findFirst({
        where: { id, ...tenantFilter },
        select: orderSelect,
      })
      if (refreshed) order = refreshed
    }

    const PENDING_PAYMENT_TIMEOUT_MS = 2 * 60 * 60 * 1000 // 2 horas

    // CORREÇÃO: cancelar automaticamente quando o PIX expira, sem depender só
    // do webhook do MP (que pode demorar/falhar) nem do cron diário (no plano
    // Hobby da Vercel só roda 1x/dia — muito lento pra uma janela de 5min).
    // Precisa ser o PIX especificamente (não `payments[0]`): agora que a
    // query acima também traz pagamentos CREDIT_CARD, o primeiro item do
    // array pode não ser mais o PIX.
    const expiredPix = order.payments.find((p) => p.method === 'PIX')
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

      let affectedProductIds: string[] = []
      await prisma.$transaction(async (tx) => {
        // Só cancela se ainda estiver PENDING no momento exato da transação
        // (evita corrida com o webhook do MP ou outra consulta concorrente).
        const updated = await tx.order.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            status: 'CANCELLED',
            paymentStatus: 'FAILED',
            cancelledAt: new Date(),
            cancelReason,
          },
        })
        if (updated.count === 0) return // outra rotina já tratou este pedido

        await tx.payment.updateMany({
          where: { orderId: id, status: 'PENDING' },
          data: { status: 'FAILED', failedAt: new Date() },
        })
        await tx.orderStatusHistory.create({
          data: { orderId: id, status: 'CANCELLED', notes: historyNote },
        })
        // Devolve ao estoque tudo que foi debitado na criação do pedido
        const result = await restockCancelledOrder(tx, { tenantId: order.tenantId, orderId: id })
        affectedProductIds = result.affectedProductIds
      })

      if (affectedProductIds.length > 0) {
        await revalidateStorefrontForTenant(order.tenantId)
      }

      order.status = 'CANCELLED'
      if (pixExpired) {
        order.paymentStatus = 'FAILED'
        if (expiredPix) expiredPix.status = 'FAILED'
      }
    }

    // Não retornar QR Code de PIX expirado
    const now = new Date()
    const payments = order.payments.map((p) => ({
      id: p.id,
      status: p.status,
      method: p.method,
      amount: Number(p.amount),
      pixExpiresAt: p.pixExpiresAt,
      checkoutUrl: p.checkoutUrl,
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
      // Mapa de rastreamento ao vivo — só relevante para pedidos de entrega
      // "a caminho". Qualquer um dos três pode vir null (loja sem
      // localização cadastrada, endereço não geocodificado, ou entregador
      // ainda não começou a compartilhar a posição).
      ...(order.type === 'DELIVERY' ? {
        tracking: {
          store: (order.tenant.latitude != null && order.tenant.longitude != null)
            ? { lat: order.tenant.latitude, lng: order.tenant.longitude }
            : null,
          destination: (order.deliveryLat != null && order.deliveryLng != null)
            ? { lat: order.deliveryLat, lng: order.deliveryLng }
            : null,
          courier: (order.courierLat != null && order.courierLng != null)
            ? { lat: order.courierLat, lng: order.courierLng, updatedAt: order.courierUpdatedAt }
            : null,
        },
      } : {}),
    })
  } catch (error) {
    console.error('[orders/status] Erro interno:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Exportar o helper para uso em createOrderAction
export { generateStatusToken }
