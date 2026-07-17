// app/api/webhooks/efi-pix/route.ts
//
// Webhook da API PIX da Efí (cobrança avulsa dos tenants) — DIFERENTE do
// webhook de Cobranças (app/api/webhooks/efi/route.ts, usado só pela
// assinatura da plataforma): aqui a Efí manda o conteúdo direto no corpo
// do POST, sem token pra consultar depois.
//
// Registrado com x-skip-mtls-checking: true (ver lib/efi/tenant-pix-client.ts
// configurePixWebhook), então chega como POST HTTPS normal, sem exigir
// certificado cliente do nosso lado.
//
// AINDA NÃO LIGADO: o roteamento de criação de cobrança Pix via Efí
// (create-order.ts etc.) ainda não existe, então nenhum Payment tem
// provider=EFI/providerReference=txid pra este webhook encontrar. Esse
// endpoint já fica pronto e registrado pra quando essa próxima etapa for
// implementada.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

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
        include: { order: { select: { id: true, tenantId: true, total: true, status: true } } },
      })

      if (!payment) {
        // Normal por enquanto (roteamento Efí Pix ainda não existe) — não
        // é erro, só não tem nada pra fazer com essa notificação.
        console.log('[webhook/efi-pix] nenhum Payment correspondente ao txid', entry.txid)
        continue
      }

      if (payment.status === 'PAID') continue // idempotência — já processado

      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', paidAt: new Date(), webhookData: entry as any },
      })

      console.log('[webhook/efi-pix] pagamento confirmado', { paymentId: payment.id, txid: entry.txid })

      // A mesma lógica de "soma tudo que já foi PAID vs order.total" usada
      // no webhook do MP (evita marcar pedido dividido como pago cedo
      // demais) deve ser reaproveitada aqui quando o roteamento for
      // implementado — por enquanto só marca o Payment.
    } catch (err) {
      console.error('[webhook/efi-pix] erro ao processar entrada', String(err))
    }
  }

  return NextResponse.json({ ok: true })
}
