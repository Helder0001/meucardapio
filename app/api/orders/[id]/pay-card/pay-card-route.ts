// app/api/orders/[id]/pay-card/route.ts
//
// Processa o pagamento de um pedido com cartão de crédito via Checkout
// Transparente. Recebe o card_token gerado pelo MP.js no browser do cliente
// (nunca os dados reais do cartão — eles nunca chegam ao nosso servidor).
//
// Retorna o resultado imediato: approved / pending / rejected
// O webhook /api/webhooks/mercadopago cuida das confirmações assíncronas.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { createCardPayment } from '@/lib/mercadopago/checkout-client'
import { getPaymentProvider } from '@/lib/payments/provider-router'
import { createTenantCardCharge } from '@/lib/efi/tenant-payments'
import { publishOrderEvent } from '@/lib/cache/redis'
import { applyCashback, applyLoyaltyPoints } from '@/lib/loyalty/apply-rewards'
import type { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import { z } from 'zod'

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

const payCardSchema = z.object({
  token: z.string().min(10),
  cardToken: z.string().min(5),
  installments: z.number().int().min(1).max(12).optional().default(1),
  paymentMethodId: z.string().min(1),
  issuerId: z.string().optional(),
  customerEmail: z.string().email(),
  // CORREÇÃO: aceitava só CPF (11 dígitos) sem remover formatação — o Brick
  // pode devolver o documento com pontuação, e o cliente pode ter CNPJ (14
  // dígitos) selecionado no formulário, não só CPF. Removemos não-dígitos
  // antes de validar e aceitamos os dois tamanhos.
  customerCpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 11 || v.length === 14, 'Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos'),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(20).optional(),
})

// Mesmo mecanismo do /status e /regenerate-pix — token HMAC curto pra
// autorizar o cliente final sem exigir login.
function validateStatusToken(orderId: string, token: string): boolean {
  const secret = process.env.ORDER_TOKEN_SECRET ?? process.env.AUTH_SECRET ?? ''
  const expected = crypto.createHmac('sha256', secret).update(orderId).digest('hex')
  if (expected.length !== token.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
  } catch {
    return false
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const rawBody = await request.json().catch(() => null)
  const parsed = payCardSchema.safeParse(rawBody)
  if (!parsed.success) {
    // LOG TEMPORÁRIO DE DIAGNÓSTICO — mostra só quais campos vieram
    // ausentes/inválidos e o tipo de erro, sem logar os valores em si
    // (evita expor CPF/e-mail em texto puro nos logs). Remover depois de
    // identificar a causa do "Dados de pagamento incompletos ou inválidos".
    console.warn('[pay-card][debug] validação falhou', {
      camposRecebidos: rawBody && typeof rawBody === 'object' ? Object.keys(rawBody) : null,
      identificationPresente: rawBody?.customerCpf !== undefined,
      identificationTamanho: typeof rawBody?.customerCpf === 'string' ? rawBody.customerCpf.length : null,
      emailPresente: rawBody?.customerEmail !== undefined,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
    })
    return NextResponse.json({ error: 'Dados de pagamento incompletos ou inválidos' }, { status: 400 })
  }
  const body = parsed.data

  // VULN-CRIT-03: antes desta rota não tinha checagem nenhuma — qualquer
  // sessão (de qualquer tenant) que soubesse o id de um pedido alheio podia
  // tentar cobrar cartão nele e disparar cashback/pontos indevidos.
  if (!validateStatusToken(id, body.token)) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }

  const order = await prisma.order.findFirst({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      orderNumber: true,
      total: true,
      status: true,
      paymentStatus: true,
      customerId: true,
    },
  })

  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }
  if (order.paymentStatus === 'PAID') {
    return NextResponse.json({ error: 'Pedido já está pago' }, { status: 400 })
  }

  // Mesmo bug do /payment-link: cobrava sempre o total CHEIO do pedido,
  // ignorando pagamentos parciais já registrados (ex.: parte no PIX).
  const alreadyPaidBefore = await prisma.payment.aggregate({
    where: { orderId: order.id, status: 'PAID' },
    _sum: { amount: true },
  })
  const stillOwed = Math.max(
    0,
    Math.round((Number(order.total) - Number(alreadyPaidBefore._sum.amount ?? 0)) * 100) / 100
  )
  if (stillOwed <= 0) {
    return NextResponse.json({ error: 'Não há saldo restante a cobrar neste pedido' }, { status: 400 })
  }

  const cardProvider = await getPaymentProvider(order.tenantId, 'card')

  if (cardProvider === 'EFI') {
    try {
      const chargeResult = await createTenantCardCharge({
        tenantId: order.tenantId,
        orderId: order.id,
        amount: stillOwed,
        paymentToken: body.cardToken, // mesmo campo do form, mas aqui é o payment_token do Efí.js, não o card_token_id do MP
        payerCpf: body.customerCpf,
        payerName: body.customerName || 'Cliente',
        payerEmail: body.customerEmail,
        payerPhone: body.customerPhone || '',
        description: `Pedido #${String(order.orderNumber).padStart(4, '0')}`,
      })

      const isApproved = chargeResult.status === 'approved'
      const isRejected = chargeResult.status === 'unpaid' || chargeResult.status === 'refunded' || chargeResult.status === 'canceled'

      const existingEfiPayment = await prisma.payment.findFirst({
        where: { orderId: order.id, provider: 'EFI', providerReference: String(chargeResult.chargeId) },
      })

      // BUG CORRIGIDO: todo pedido não-PIX já nasce com um Payment
      // "placeholder" (status PENDING, sem provider/providerReference —
      // ver actions/orders/create-order.ts) usado pelo dashboard pra
      // mostrar "Confirmar"/"Trocar forma de pagamento" em pedidos de
      // balcão. Sem checar por ele aqui, essa rota sempre criava um
      // Payment NOVO pro resultado real da cobrança, deixando o
      // placeholder original órfão pra sempre — por isso o pedido
      // aparecia com 2 linhas de pagamento (uma paga, uma pendente pra
      // sempre) em vez de 1.
      const placeholderPayment = !existingEfiPayment
        ? await prisma.payment.findFirst({
            where: { orderId: order.id, method: 'CREDIT_CARD', status: 'PENDING', providerReference: null },
            orderBy: { createdAt: 'asc' },
          })
        : null

      const efiPaymentData = {
        tenantId: order.tenantId,
        orderId: order.id,
        method: 'CREDIT_CARD' as const,
        status: (isApproved ? 'PAID' : isRejected ? 'FAILED' : 'PENDING') as 'PAID' | 'FAILED' | 'PENDING',
        amount: stillOwed,
        provider: 'EFI' as const,
        providerReference: String(chargeResult.chargeId),
        cardLastDigits: chargeResult.cardMask?.slice(-4),
        paidAt: isApproved ? new Date() : undefined,
        failedAt: isRejected ? new Date() : undefined,
      }

      const targetPaymentId = existingEfiPayment?.id ?? placeholderPayment?.id
      const efiPayment = targetPaymentId
        ? await prisma.payment.update({ where: { id: targetPaymentId }, data: efiPaymentData })
        : await prisma.payment.create({ data: efiPaymentData })

      if (isApproved) {
        const isFullyPaid = await prisma.$transaction(async (tx: Tx) => {
          const paidPayments = await tx.payment.findMany({
            where: { orderId: order.id, status: 'PAID' },
            select: { amount: true },
          })
          const totalPaid = paidPayments.reduce((s: number, p: { amount: any }) => s + Number(p.amount), 0)
          const fullyPaid = Math.round(totalPaid * 100) >= Math.round(Number(order.total) * 100)

          await tx.order.update({
            where: { id: order.id },
            data: fullyPaid
              ? { paymentStatus: 'PAID', status: 'CONFIRMED', confirmedAt: new Date() }
              : { paymentStatus: 'PARTIAL' },
          })
          if (fullyPaid && order.customerId) {
            await applyCashback(tx, order.tenantId, order.customerId, order.id, Number(order.total))
            await applyLoyaltyPoints(tx, order.tenantId, order.customerId, order.id, Number(order.total))
          }
          return fullyPaid
        })

        await publishOrderEvent(order.tenantId, {
          type: 'ORDER_UPDATED',
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: isFullyPaid ? 'CONFIRMED' : order.status,
          paymentStatus: isFullyPaid ? 'PAID' : 'PARTIAL',
        })
      }

      return NextResponse.json({
        status: isApproved ? 'approved' : isRejected ? 'rejected' : 'pending',
        cardLastDigits: efiPayment.cardLastDigits,
        paymentId: efiPayment.id,
      })
    } catch (err) {
      console.error('[pay-card][efi]', err)
      return NextResponse.json(
        { error: 'Não foi possível processar o pagamento pela Efí. Verifique os dados do cartão e tente novamente.' },
        { status: 500 }
      )
    }
  }

  try {
    const result = await createCardPayment({
      tenantId: order.tenantId,
      orderId: order.id,
      amount: stillOwed,
      cardToken: body.cardToken,
      installments: body.installments ?? 1,
      paymentMethodId: body.paymentMethodId,
      issuerId: body.issuerId,
      customerEmail: body.customerEmail,
      customerCpf: body.customerCpf,
      // CORREÇÃO: identification.type era sempre 'CPF' fixo no
      // checkout-client.ts, mesmo quando o documento tinha 14 dígitos
      // (CNPJ) — o MP rejeita/valida errado nesse caso.
      customerDocumentType: body.customerCpf.length === 14 ? 'CNPJ' : 'CPF',
      customerName: body.customerName,
    })

    // Mesmo bug corrigido acima no branch EFI: reaproveita o Payment
    // placeholder (criado em actions/orders/create-order.ts) em vez de
    // deixar o upsert por mercadoPagoId sempre criar um registro novo.
    const placeholderPayment = await prisma.payment.findFirst({
      where: { orderId: order.id, method: 'CREDIT_CARD', status: 'PENDING', mercadoPagoId: null },
      orderBy: { createdAt: 'asc' },
    })

    const mpPaymentData = {
      mercadoPagoStatus: result.status,
      cardLastDigits: result.cardLastDigits,
      cardBrand: result.cardBrand,
      installments: result.installments,
      status: result.status === 'approved' ? 'PAID' as const
        : result.status === 'rejected' ? 'FAILED' as const
        : 'PENDING' as const,
      paidAt: result.status === 'approved' ? new Date() : undefined,
      failedAt: result.status === 'rejected' ? new Date() : undefined,
    }

    // Criar ou atualizar o registro de pagamento
    const payment = placeholderPayment
      ? await prisma.payment.update({
          where: { id: placeholderPayment.id },
          data: { ...mpPaymentData, mercadoPagoId: result.mercadoPagoId },
        })
      : await prisma.payment.upsert({
          where: { mercadoPagoId: result.mercadoPagoId },
          update: mpPaymentData,
          create: {
            tenantId: order.tenantId,
            orderId: order.id,
            method: 'CREDIT_CARD',
            amount: stillOwed,
            mercadoPagoId: result.mercadoPagoId,
            ...mpPaymentData,
          },
        })

    // Aprovado imediatamente — confirmar o pedido (se cobrir o total) e
    // aplicar rewards. Mesma lógica do webhook: só marca PAID/CONFIRMED
    // quando a soma de tudo que já foi pago cobre o total do pedido.
    if (result.status === 'approved') {
      const isFullyPaid = await prisma.$transaction(async (tx: Tx) => {
        const paidPayments = await tx.payment.findMany({
          where: { orderId: order.id, status: 'PAID' },
          select: { amount: true },
        })
        const totalPaid = paidPayments.reduce((s: number, p: { amount: any }) => s + Number(p.amount), 0)
        const fullyPaid = Math.round(totalPaid * 100) >= Math.round(Number(order.total) * 100)

        await tx.order.update({
          where: { id: order.id },
          data: fullyPaid
            ? { paymentStatus: 'PAID', status: 'CONFIRMED', confirmedAt: new Date() }
            : { paymentStatus: 'PARTIAL' },
        })
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: fullyPaid ? 'CONFIRMED' : order.status,
            notes: fullyPaid
              ? `Pagamento com cartão ${result.cardBrand ?? ''} aprovado — final ${result.cardLastDigits ?? ''}`
              : `Pagamento parcial com cartão ${result.cardBrand ?? ''} aprovado (R$ ${stillOwed.toFixed(2)}) — final ${result.cardLastDigits ?? ''}`,
          },
        })
        if (fullyPaid && order.customerId) {
          await applyCashback(tx, order.tenantId, order.customerId, order.id, Number(order.total))
          await applyLoyaltyPoints(tx, order.tenantId, order.customerId, order.id, Number(order.total))
        }
        return fullyPaid
      })

      await publishOrderEvent(order.tenantId, {
        type: 'ORDER_UPDATED',
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: isFullyPaid ? 'CONFIRMED' : order.status,
        paymentStatus: isFullyPaid ? 'PAID' : 'PARTIAL',
      })
    }

    return NextResponse.json({
      status: result.status,
      statusDetail: result.statusDetail,
      cardLastDigits: result.cardLastDigits,
      cardBrand: result.cardBrand,
      installments: result.installments,
      paymentId: payment.id,
    })
  } catch (err) {
    console.error('[pay-card]', err)
    return NextResponse.json(
      { error: 'Não foi possível processar o pagamento. Verifique os dados do cartão e tente novamente.' },
      { status: 422 }
    )
  }
}
