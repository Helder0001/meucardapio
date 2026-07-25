// app/api/webhooks/efi-pix/pix/route.ts
//
// Handler REAL do webhook Pix da Efí. Path com /pix no final não é
// escolha nossa — é convenção do próprio padrão Pix do Banco Central
// (https://github.com/bacen/pix-api): toda PSP notifica em
// "{url_cadastrada}/pix", sempre. A gente registra
// "{NEXT_PUBLIC_APP_URL}/api/webhooks/efi-pix" (sem sufixo — ver
// lib/efi/tenant-pix-client.ts configurePixWebhook) e a Efí soma o "/pix"
// sozinha na hora de notificar, batendo com esse arquivo aqui.
//
// Webhook de Cobranças (app/api/webhooks/efi/route.ts, usado só pela
// assinatura da plataforma) é uma API diferente e não segue essa
// convenção — lá a Efí manda só um token e a gente consulta os detalhes
// depois; aqui o conteúdo já vem completo no corpo do POST.
//
// Registrado com x-skip-mtls-checking: true (ver lib/efi/tenant-pix-client.ts
// configurePixWebhook), então chega como POST HTTPS normal, sem exigir
// certificado cliente do nosso lado.

import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { applyCashback, applyLoyaltyPoints } from '@/lib/loyalty/apply-rewards'

interface PixWebhookEntry {
  endToEndId: string
  txid: string
  valor: string
  horario: string
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const entries: PixWebhookEntry[] = body?.pix ?? []

  if (!entries.length) {
    return NextResponse.json({ ok: true })
  }

  for (const entry of entries) {
    if (!entry.txid) continue

    try {
      const payment = await prisma.payment.findFirst({
        where: { provider: 'EFI', providerReference: entry.txid, method: 'PIX' },
        include: { order: { select: { id: true, tenantId: true, total: true, status: true, customerId: true, orderNumber: true } } },
      })

      if (!payment) {
        console.log('[webhook/efi-pix] nenhum Payment correspondente ao txid', entry.txid)
        continue
      }

      if (payment.status === 'PAID') continue // idempotência — já processado

      // Mesma lógica usada no webhook do MP (app/api/webhooks/mercadopago/route.ts):
      // só marca o PEDIDO como pago/confirmado quando a soma de tudo que já
      // foi pago (incluindo este) cobre o total — evita marcar PAID cedo
      // demais em pedido com pagamento dividido (parte PIX, parte outro
      // método).
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.payment.updateMany({
          where: { id: payment.id, status: { not: 'PAID' } },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            webhookData: entry as any,
            // Guardado agora porque é a ÚNICA vez que a Efí nos manda o
            // e2eId — precisa dele depois pra solicitar estorno
            // (PUT /v2/pix/:e2eId/devolucao/:id).
            pixEndToEndId: entry.endToEndId,
          },
        })
        if (updated.count === 0) return { processed: false as const }

        const paidPayments = await tx.payment.findMany({
          where: { orderId: payment.order.id, status: 'PAID' },
          select: { amount: true },
        })
        const totalPaid = paidPayments.reduce((s, p) => s + Number(p.amount), 0)
        const orderTotal = Number(payment.order.total)
        const isFullyPaid = Math.round(totalPaid * 100) >= Math.round(orderTotal * 100)

        await tx.order.update({
          where: { id: payment.order.id },
          data: isFullyPaid
            ? { paymentStatus: 'PAID', status: 'CONFIRMED', confirmedAt: new Date() }
            : { paymentStatus: 'PARTIAL' },
        })

        if (isFullyPaid && payment.order.customerId) {
          await applyCashback(tx, payment.tenantId, payment.order.customerId, payment.order.id, orderTotal)
          await applyLoyaltyPoints(tx, payment.tenantId, payment.order.customerId, payment.order.id, orderTotal)
        }

        return { processed: true as const, isFullyPaid }
      })

      if (result.processed) {
        console.log('[webhook/efi-pix] pagamento confirmado', {
          paymentId: payment.id,
          txid: entry.txid,
          isFullyPaid: result.isFullyPaid,
        })

        after(async () => {
          try {
            await publishOrderEvent(payment.tenantId, {
              type: 'ORDER_UPDATED',
              orderId: payment.order.id,
              orderNumber: payment.order.orderNumber,
              status: result.isFullyPaid ? 'CONFIRMED' : payment.order.status,
              paymentStatus: result.isFullyPaid ? 'PAID' : 'PARTIAL',
            })
          } catch (err) {
            console.error('[webhook/efi-pix] erro em efeito colateral pós-resposta:', err)
          }
        })
      }
    } catch (err) {
      console.error('[webhook/efi-pix] erro ao processar entrada', String(err))
    }
  }

  return NextResponse.json({ ok: true })
}
