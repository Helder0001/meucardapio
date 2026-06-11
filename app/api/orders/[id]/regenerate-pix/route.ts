// app/api/orders/[id]/regenerate-pix/route.ts
// Regenera o QR Code PIX quando o anterior expirar.
// Requer statusToken (mesmo mecanismo do /status) para evitar uso indevido.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
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
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Validar token de acesso (mesmo fluxo do /status)
  const { token } = await req.json().catch(() => ({ token: null }))
  if (!token || !validateStatusToken(id, token)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const order = await prisma.order.findFirst({
    where: { id, paymentStatus: { not: 'PAID' } },
    select: {
      id: true,
      tenantId: true,
      total: true,
      customer: { select: { phone: true, name: true } },
      tenant: { select: { settings: true } },
    },
  })
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

  const settings  = order.tenant.settings as any
  const accessToken = settings?.mercadoPagoAccessToken ?? process.env.MERCADOPAGO_ACCESS_TOKEN

  if (!accessToken) {
    return NextResponse.json({ error: 'Mercado Pago não configurado' }, { status: 503 })
  }

  try {
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${id}-regen-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: Number(order.total),
        payment_method_id:  'pix',
        payer: {
          email: 'cliente@foodsaas.com',
          identification: { type: 'CPF', number: '00000000000' },
        },
        description: `Pedido #${id.slice(-8).toUpperCase()}`,
        external_reference: id,
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`,
        date_of_expiration: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }),
    })

    if (!mpRes.ok) {
      const err = await mpRes.json()
      console.error('[regenerate-pix] MP Error:', err)
      return NextResponse.json({ error: 'Erro ao gerar PIX' }, { status: 502 })
    }

    const mpData = await mpRes.json()
    const pixQrCode       = mpData.point_of_interaction?.transaction_data?.qr_code ?? null
    const pixQrCodeBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64 ?? null
    const pixExpiresAt    = new Date(Date.now() + 5 * 60 * 1000)

    // Atualiza o payment existente ou cria um novo
    const existing = await prisma.payment.findFirst({
      where: { orderId: id, method: 'PIX' },
      orderBy: { createdAt: 'desc' },
    })

    const payment = existing
      ? await prisma.payment.update({
          where: { id: existing.id },
          data: {
            mercadoPagoId:     String(mpData.id),
            mercadoPagoStatus: mpData.status,
            pixQrCode,
            pixQrCodeBase64,
            pixExpiresAt,
            status: 'PENDING',
          },
        })
      : await prisma.payment.create({
          data: {
            tenantId:          order.tenantId,
            orderId:           id,
            method:            'PIX',
            status:            'PENDING',
            amount:            order.total,
            mercadoPagoId:     String(mpData.id),
            mercadoPagoStatus: mpData.status,
            pixQrCode,
            pixQrCodeBase64,
            pixExpiresAt,
          },
        })

    return NextResponse.json({
      payment: {
        status:          payment.status,
        pixQrCode:       (payment as any).pixQrCode,
        pixQrCodeBase64: (payment as any).pixQrCodeBase64,
        pixExpiresAt:    (payment as any).pixExpiresAt,
        amount:          Number((payment as any).amount),
      },
    })
  } catch (err) {
    console.error('[regenerate-pix] Error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
