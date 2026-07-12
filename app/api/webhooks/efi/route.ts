// app/api/webhooks/efi/route.ts
//
// Webhook da Efí Bank pra cobrança recorrente do plano PRO da plataforma.
//
// IMPORTANTE: diferente do Mercado Pago, a Efí NÃO manda o conteúdo da
// mudança no POST — só um token. É preciso responder 200 rápido e então
// consultar GET /v1/notification/:token pra saber o que de fato mudou.
// Se esse GET nunca for feito, a Efí considera que a notificação não foi
// recebida e fica reenviando o POST por até 3 dias.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { getEfiNotification } from '@/lib/efi/subscription'

export async function POST(req: NextRequest) {
  let token: string | null = null

  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const body = await req.json()
      token = body?.notification ?? null
    } else {
      const form = await req.formData()
      token = (form.get('notification') as string) ?? null
    }
  } catch {
    // corpo vazio/ilegível — segue com token null, tratado abaixo
  }

  if (!token) {
    console.warn('[webhook/efi] POST sem "notification" token', { contentType: req.headers.get('content-type') })
    return NextResponse.json({ ok: true }) // responde 200 mesmo assim pra não entrar em retry infinito por engano
  }

  try {
    const entries = await getEfiNotification(token)
    console.log('[webhook/efi] notificação recebida', { token, entries: entries.length })

    for (const entry of entries) {
      if (entry.type !== 'subscription_charge' || !entry.identifiers.subscription_id) continue

      const subscription = await prisma.subscription.findFirst({
        where: { efiSubscriptionId: entry.identifiers.subscription_id, provider: 'EFI' },
      })
      if (!subscription) {
        console.warn('[webhook/efi] Nenhuma Subscription encontrada pro efiSubscriptionId', entry.identifiers.subscription_id)
        continue
      }

      if (entry.status.current === 'paid') {
        // Idempotência: se esse charge_id já foi processado (mesmo
        // efiChargeId e status ACTIVE), não reprocessa nem duplica avanço
        // de período em reenvios de notificação.
        if (subscription.efiChargeId === entry.identifiers.charge_id && subscription.status === 'ACTIVE') {
          continue
        }

        const nextPeriodEnd = new Date(subscription.currentPeriodEnd)
        if (subscription.billingCycle === 'ANNUAL') {
          nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1)
        } else {
          nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1)
        }

        await prisma.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'ACTIVE',
              efiChargeId: entry.identifiers.charge_id,
              currentPeriodEnd: nextPeriodEnd,
            },
          })
          await tx.tenant.update({
            where: { id: subscription.tenantId },
            data: { subscriptionStatus: 'ACTIVE' },
          })
        })

        console.log('[webhook/efi] cobrança confirmada, assinatura ativa', {
          tenantId: subscription.tenantId,
          efiSubscriptionId: entry.identifiers.subscription_id,
          chargeId: entry.identifiers.charge_id,
        })
      } else if (entry.status.current === 'unpaid') {
        // Mesma regra do MP: cobrança recusada -> PAST_DUE, e o
        // paywall (app/(dashboard)/layout.tsx) já bloqueia por padrão
        // qualquer status que não seja ACTIVE/TRIAL válido.
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'PAST_DUE' },
          }),
          prisma.tenant.update({
            where: { id: subscription.tenantId },
            data: { subscriptionStatus: 'PAST_DUE' },
          }),
        ])

        console.log('[webhook/efi] cobrança recusada/não paga', {
          tenantId: subscription.tenantId,
          efiSubscriptionId: entry.identifiers.subscription_id,
          chargeId: entry.identifiers.charge_id,
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/efi] Erro ao processar notificação', String(err))
    // Retorna 200 mesmo em erro interno pra não entrar num loop de retry
    // da Efí por até 3 dias travado no mesmo evento; o erro já foi logado
    // pra investigação manual.
    return NextResponse.json({ ok: true })
  }
}
