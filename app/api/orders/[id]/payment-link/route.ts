// app/api/orders/[id]/payment-link/route.ts
//
// Gera um link de pagamento (Checkout Pro) para um pedido existente.
// Usado pelo garçom no dashboard (balcão) para enviar o link via WhatsApp
// ao cliente, e também pelo próprio cliente no cardápio, quando escolhe
// "Link de pagamento" como forma de pagamento no checkout.
//
// O link aceita qualquer método: PIX, crédito, débito — o cliente escolhe
// no celular dele na página segura do Mercado Pago.
//
// Autenticação: aceita sessão de staff (dashboard/balcão) OU um statusToken
// válido (mesmo mecanismo HMAC do /status — usado pelo cardápio, sem exigir
// login do cliente final).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { createPaymentPreference } from '@/lib/mercadopago/checkout-client'
import crypto from 'crypto'

function validateStatusToken(orderId: string, token: string): boolean {
  const secret = process.env.ORDER_TOKEN_SECRET ?? process.env.AUTH_SECRET ?? ''
  const expected = crypto.createHmac('sha256', secret).update(orderId).digest('hex')
  if (expected.length !== token.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
  } catch { return false }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()

  const isStaff = !!session?.user?.tenantId && ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF'].includes(session.user.role)

  let customerAuthorized = false
  if (!isStaff) {
    // Requisição do cardápio (sem sessão) — exige statusToken válido no corpo.
    const { token } = await request.json().catch(() => ({ token: null }))
    customerAuthorized = !!token && validateStatusToken(id, token)
    if (!customerAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const order = await prisma.order.findFirst({
    where: isStaff ? { id, tenantId: session!.user.tenantId ?? undefined } : { id },
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
