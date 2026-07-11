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
      tenant: { select: { slug: true } },
      payments: { select: { id: true, status: true, amount: true, preferenceId: true } },
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

  // BUG: o link sempre cobrava o total CHEIO do pedido, mesmo quando já
  // havia uma parte paga (ex.: pagamento dividido) — a segunda cobrança
  // pelo link ficava impossível de ficar correta. Agora usa o saldo
  // realmente restante (total - já pago).
  const alreadyPaid = order.payments
    .filter((p) => p.status === 'PAID')
    .reduce((s, p) => s + Number(p.amount), 0)
  const stillOwed = Math.max(0, Math.round((Number(order.total) - alreadyPaid) * 100) / 100)

  if (stillOwed <= 0) {
    return NextResponse.json({ error: 'Não há saldo restante a cobrar neste pedido' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const slug = order.tenant.slug

  try {
    const preference = await createPaymentPreference({
      tenantId: order.tenantId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: stillOwed,
      customerName: order.customer?.name ?? undefined,
      customerPhone: order.customer?.phone ?? undefined,
      items: stillOwed === Number(order.total)
        ? order.items.map((item: { productName: string; quantity: number; unitPrice: any }) => ({
            title: item.productName,
            quantity: item.quantity,
            unit_price: Number(item.unitPrice),
          }))
        // Saldo parcial (segundo pagamento) — não dá pra listar os itens
        // originais com os preços de sempre, porque a soma não bateria
        // com o valor cobrado. Um item único representando o saldo evita
        // o Mercado Pago rejeitar a preferência por inconsistência.
        : [{ title: `Saldo restante — Pedido #${String(order.orderNumber).padStart(4, '0')}`, quantity: 1, unit_price: stillOwed }],
      // BUG: sem isso, o cliente pagava e o Mercado Pago tentava redirecionar
      // pra "/menu/pedido/{id}" (sem o slug do estabelecimento) — rota que
      // não existe — em vez de voltar pra tela de status do pedido.
      backUrls: {
        success: `${appUrl}/menu/${slug}/pedido/${order.id}?status=success`,
        failure: `${appUrl}/menu/${slug}/pedido/${order.id}?status=failure`,
        pending: `${appUrl}/menu/${slug}/pedido/${order.id}?status=pending`,
      },
      expirationMinutes: 60, // link válido por 1 hora
    })

    // Salvar o link no banco — se já existia um Payment PENDING gerado por
    // um link anterior (tem preferenceId), atualiza; senão cria um novo.
    // Importante: só reaproveita um pagamento pendente que JÁ é um link
    // (tem preferenceId) — nunca um pagamento manual pendente (ex.: dinheiro
    // registrado como parte de um pagamento dividido), que é outra coisa.
    const existingLinkPayment = order.payments.find((p) => p.status === 'PENDING' && p.preferenceId)

    if (existingLinkPayment) {
      await prisma.payment.update({
        where: { id: existingLinkPayment.id },
        data: {
          amount: stillOwed,
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
          amount: stillOwed,
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
