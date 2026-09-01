// lib/efi/pix-webhook-handler.ts
//
// VULN-CRIT-01 CORRIGIDO: lógica de processamento do webhook Pix da Efí,
// extraída para um único lugar (antes estava duplicada em
// app/api/webhooks/efi-pix/route.ts e app/api/webhooks/efi-pix/pix/route.ts,
// com o mesmo bug nos dois).
//
// O webhook da Efí não tem assinatura nem mTLS do lado de quem recebe
// (o endpoint é registrado com x-skip-mtls-checking: true — ver
// configurePixWebhook em tenant-pix-client.ts). Isso significa que
// QUALQUER pessoa pode fazer um POST pra esse endpoint com um corpo
// JSON forjado. Antes, o handler confiava direto no txid/valor/horario
// do corpo do POST pra marcar o Payment como PAID — e como o txid de
// cada cobrança é devolvido ao próprio cliente no checkout (dentro do
// pixCopiaECola), isso permitia ao cliente confirmar o próprio pedido
// como pago sem pagar.
//
// Agora o corpo do webhook só serve de "sinal" (me avisa que ALGO
// aconteceu com esse txid). Antes de creditar qualquer coisa, consultamos
// a cobrança diretamente na API da Efí (GET /v2/cob/:txid, autenticado
// com client credentials + certificado mTLS do tenant) e só prosseguimos
// se a Efí confirmar status CONCLUIDA com um pagamento cujo valor bate
// com o valor devido.

import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { applyCashback, applyLoyaltyPoints } from '@/lib/loyalty/apply-rewards'
import { getTenantPixChargeStatus } from '@/lib/efi/tenant-pix-client'
import { after } from 'next/server'

export interface PixWebhookEntry {
  endToEndId?: string
  txid: string
  valor?: string
  horario?: string
}

const AMOUNT_TOLERANCE_CENTS = 1 // arredondamento de ponto flutuante

export async function processEfiPixWebhookEntries(entries: PixWebhookEntry[]): Promise<void> {
  for (const entry of entries) {
    if (!entry?.txid) continue

    try {
      const payment = await prisma.payment.findFirst({
        where: { provider: 'EFI', providerReference: entry.txid, method: 'PIX' },
        include: {
          order: {
            select: { id: true, tenantId: true, total: true, status: true, customerId: true, orderNumber: true },
          },
        },
      })

      if (!payment) {
        console.log('[webhook/efi-pix] nenhum Payment correspondente ao txid', entry.txid)
        continue
      }

      if (payment.status === 'PAID') continue // idempotência — já processado

      // ── Confirmação autoritativa: nunca confiar só no corpo do POST ──
      let confirmedEntry: { endToEndId: string; valor: string; horario: string }
      try {
        const charge = await getTenantPixChargeStatus(payment.tenantId, entry.txid)

        if (charge.status !== 'CONCLUIDA') {
          console.warn('[webhook/efi-pix] cobrança consultada na Efí ainda não está CONCLUIDA — ignorando notificação', {
            txid: entry.txid,
            statusNaEfi: charge.status,
          })
          continue
        }

        const expectedCents = Math.round(Number(payment.amount) * 100)
        const match = charge.pix.find((p) => {
          const paidCents = Math.round(Number(p.valor) * 100)
          return Math.abs(paidCents - expectedCents) <= AMOUNT_TOLERANCE_CENTS
        })

        if (!match) {
          console.error('[webhook/efi-pix] Efí confirmou a cobrança, mas nenhum pagamento recebido bate com o valor esperado — possível tentativa de fraude ou cobrança parcial', {
            txid: entry.txid,
            esperadoCentavos: expectedCents,
            recebidosNaEfi: charge.pix,
          })
          continue
        }

        // Usamos os dados vindos da consulta autenticada à Efí, nunca os
        // do corpo do webhook (que não é autenticado).
        confirmedEntry = match
      } catch (err) {
        console.error('[webhook/efi-pix] falha ao confirmar cobrança na API da Efí — pagamento NÃO liberado', {
          txid: entry.txid,
          erro: String(err),
        })
        // Não credita. A Efí reenvia o webhook em caso de falha, e o
        // próximo POST tenta a confirmação de novo.
        continue
      }

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
            // (PUT /v2/pix/:e2eId/devolucao/:id). Vem da consulta
            // autoritativa, não do corpo do webhook.
            pixEndToEndId: confirmedEntry.endToEndId,
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
        console.log('[webhook/efi-pix] pagamento confirmado (validado na API da Efí)', {
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
}
