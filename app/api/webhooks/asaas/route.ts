// app/api/webhooks/asaas/route.ts
//
// Webhook do Asaas para pagamentos dos TENANTS (Pix/cartão no cardápio
// digital) — não confundir com o webhook da Efí, que é da assinatura PRO
// da plataforma.
//
// Segurança: o Asaas manda o token configurado no momento da criação do
// webhook (ver actions/settings/save-payment-settings.ts:connectAsaas) no
// header "asaas-access-token". Comparamos com o que guardamos
// criptografado pra esse tenant — sem isso, qualquer um poderia forjar uma
// chamada dizendo "esse pedido foi pago".
//
// tenantId vem via query string (?tenantId=...) porque cada tenant tem seu
// próprio webhook registrado na própria conta Asaas dele — não tem como o
// payload do evento identificar de qual tenant é sozinho.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { decrypt, safeCompareHash } from '@/lib/security/crypto'
import { createHash } from 'crypto'

interface AsaasWebhookPayload {
  event: string
  payment?: {
    id: string
    status: string
    externalReference?: string | null
  }
}

export async function POST(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId')
  if (!tenantId) {
    console.warn('[webhook/asaas] chamada sem tenantId na query string')
    return NextResponse.json({ ok: true })
  }

  let body: AsaasWebhookPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Valida o token do header contra o que guardamos pra esse tenant.
  const receivedToken = req.headers.get('asaas-access-token')
  const connection = await prisma.asaasConnection.findFirst({
    where: { tenantId, revokedAt: null },
    select: { webhookTokenEnc: true },
  })

  if (connection?.webhookTokenEnc) {
    const expectedToken = decrypt(connection.webhookTokenEnc)
    const receivedHash = createHash('sha256').update(receivedToken ?? '').digest('hex')
    const expectedHash = createHash('sha256').update(expectedToken).digest('hex')
    if (!receivedToken || !safeCompareHash(receivedHash, expectedHash)) {
      console.warn('[webhook/asaas] token inválido', { tenantId })
      return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    }
  }

  const payment = body.payment
  if (!payment) {
    return NextResponse.json({ ok: true })
  }

  console.log('[webhook/asaas] evento recebido', { tenantId, event: body.event, asaasPaymentId: payment.id })

  // Só nos interessa a cobrança efetivamente recebida — PAYMENT_CONFIRMED
  // chega antes (fundos ainda não disponíveis), mas pro cardápio digital o
  // que importa é liberar o pedido pro cliente/cozinha assim que o Asaas
  // considerar o Pix pago.
  if (body.event !== 'PAYMENT_RECEIVED' && body.event !== 'PAYMENT_CONFIRMED') {
    return NextResponse.json({ ok: true })
  }

  try {
    const dbPayment = await prisma.payment.findFirst({
      where: { providerReference: payment.id, provider: 'ASAAS', tenantId },
      select: { id: true, orderId: true, status: true, order: { select: { total: true } } },
    })

    if (!dbPayment) {
      console.warn('[webhook/asaas] Payment não encontrado pra providerReference', payment.id)
      return NextResponse.json({ ok: true })
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update atômico e condicional — evita processar duas vezes se o
      // Asaas reenviar o mesmo evento (ele garante "ao menos uma vez", não
      // exatamente uma vez).
      const updated = await tx.payment.updateMany({
        where: { id: dbPayment.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: new Date(), webhookData: body as any },
      })
      if (updated.count === 0) return { processed: false as const }

      const paidPayments = await tx.payment.findMany({
        where: { orderId: dbPayment.orderId, status: 'PAID' },
        select: { amount: true },
      })
      const totalPaid = paidPayments.reduce((s, p) => s + Number(p.amount), 0)
      const orderTotal = Number(dbPayment.order.total)
      const isFullyPaid = Math.round(totalPaid * 100) >= Math.round(orderTotal * 100)

      await tx.order.update({
        where: { id: dbPayment.orderId },
        data: isFullyPaid
          ? { paymentStatus: 'PAID', status: 'CONFIRMED', confirmedAt: new Date() }
          : { paymentStatus: 'PARTIAL' },
      })

      return { processed: true as const, isFullyPaid }
    })

    if (result.processed) {
      console.log('[webhook/asaas] pagamento confirmado', {
        tenantId, orderId: dbPayment.orderId, isFullyPaid: result.isFullyPaid,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/asaas] erro ao processar evento', String(err))
    // 200 mesmo em erro interno — evita reenvio infinito; erro já logado.
    return NextResponse.json({ ok: true })
  }
}
