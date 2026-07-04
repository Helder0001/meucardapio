// app/api/orders/[id]/payment-link/route.ts
//
// Gera um link de pagamento (Checkout Pro) para um pedido existente.
// Usado pelo garçom no dashboard para enviar o link via WhatsApp ao cliente.
//
// O link aceita qualquer método: PIX, crédito, débito — o cliente escolhe
// no celular dele na página segura do Mercado Pago.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { createPaymentPreference } from '@/lib/mercadopago/checkout-client'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params

  const order = await prisma.order.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      id: true,
      tenantId: true,
      orderNumber: true,
      total: true,
      paymentStatus: true,
      customer: { select: { name: true, phone: true } },
      items: {
        select: { productName: true, quantity: true, unitPrice: true },
      },
    },
  })

  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }

  if (order.paymentStatus === 'PAID') {
    return NextResponse.json({ error: 'Pedido já está pago' }, { status: 400 })
  }

  try {
    const preference = await createPaymentPreference({
      tenantId: order.tenantId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: Number(order.total),
      customerName: order.customer?.name ?? undefined,
      customerPhone: order.customer?.phone ?? undefined,
      items: order.items.map((item: { productName: string; quantity: number; unitPrice: any }) => ({
        title: item.productName,
        quantity: item.quantity,
        unit_price: Number(item.unitPrice),
      })),
      expirationMinutes: 60, // link válido por 1 hora
    })

    // Salvar o link no banco — se já existia um Payment PENDING para este
    // pedido, atualiza; senão cria um novo.
    const existingPayment = await prisma.payment.findFirst({
      where: { orderId: order.id, status: 'PENDING' },
    })

    if (existingPayment) {
      await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          preferenceId: preference.preferenceId,
          checkoutUrl: preference.checkoutUrl,
        },
      })
    } else {
      await prisma.payment.create({
        data: {
          tenantId: order.tenantId,
          orderId: order.id,
          method: 'CREDIT_CARD',
          status: 'PENDING',
          amount: order.total,
          preferenceId: preference.preferenceId,
          checkoutUrl: preference.checkoutUrl,
        },
      })
    }

    return NextResponse.json({
      checkoutUrl: preference.checkoutUrl,
      preferenceId: preference.preferenceId,
    })
  } catch (err) {
    console.error('[payment-link]', err)
    return NextResponse.json(
      { error: 'Não foi possível gerar o link de pagamento. Verifique se a conta do Mercado Pago está conectada.' },
      { status: 500 }
    )
  }
}
