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
import { publishOrderEvent } from '@/lib/cache/redis'
import { applyCashback, applyLoyaltyPoints } from '@/lib/loyalty/apply-rewards'
import type { PrismaClient } from '@prisma/client'

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => null)

  if (!body?.cardToken || !body?.paymentMethodId || !body?.customerEmail || !body?.customerCpf || !body?.customerName) {
    return NextResponse.json({ error: 'Dados de pagamento incompletos' }, { status: 400 })
  }

  const order = await prisma.order.findFirst({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      orderNumber: true,
      total: true,
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

  try {
    const result = await createCardPayment({
      tenantId: order.tenantId,
      orderId: order.id,
      amount: Number(order.total),
      cardToken: body.cardToken,
      installments: body.installments ?? 1,
      paymentMethodId: body.paymentMethodId,
      issuerId: body.issuerId,
      customerEmail: body.customerEmail,
      customerCpf: body.customerCpf,
      customerName: body.customerName,
    })

    // Criar ou atualizar o registro de pagamento
    const payment = await prisma.payment.upsert({
      where: { mercadoPagoId: result.mercadoPagoId },
      update: {
        mercadoPagoStatus: result.status,
        cardLastDigits: result.cardLastDigits,
        cardBrand: result.cardBrand,
        installments: result.installments,
        status: result.status === 'approved' ? 'PAID'
          : result.status === 'rejected' ? 'FAILED'
          : 'PENDING',
        paidAt: result.status === 'approved' ? new Date() : undefined,
        failedAt: result.status === 'rejected' ? new Date() : undefined,
      },
      create: {
        tenantId: order.tenantId,
        orderId: order.id,
        method: 'CREDIT_CARD',
        status: result.status === 'approved' ? 'PAID'
          : result.status === 'rejected' ? 'FAILED'
          : 'PENDING',
        amount: order.total,
        mercadoPagoId: result.mercadoPagoId,
        mercadoPagoStatus: result.status,
        cardLastDigits: result.cardLastDigits,
        cardBrand: result.cardBrand,
        installments: result.installments,
        paidAt: result.status === 'approved' ? new Date() : undefined,
        failedAt: result.status === 'rejected' ? new Date() : undefined,
      },
    })

    // Aprovado imediatamente — confirmar o pedido e aplicar rewards
    if (result.status === 'approved') {
      await prisma.$transaction(async (tx: Tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'PAID',
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
        })
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: 'CONFIRMED',
            notes: `Pagamento com cartão ${result.cardBrand ?? ''} aprovado — final ${result.cardLastDigits ?? ''}`,
          },
        })
        if (order.customerId) {
          await applyCashback(tx, order.tenantId, order.customerId, order.id, Number(order.total))
          await applyLoyaltyPoints(tx, order.tenantId, order.customerId, order.id, Number(order.total))
        }
      })

      await publishOrderEvent(order.tenantId, {
        type: 'ORDER_UPDATED',
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
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
