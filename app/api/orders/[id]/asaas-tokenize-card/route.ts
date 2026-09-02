// app/api/orders/[id]/asaas-tokenize-card/route.ts
//
// Proxy mínimo de tokenização do cartão via Asaas. O Asaas não oferece
// chave pública/SDK client-side (só aceita a API Key privada da conta),
// então o navegador do cliente manda os dados do cartão pra cá, a gente
// repassa IMEDIATAMENTE pro Asaas tokenizar, e devolve só o token —
// NUNCA logamos, gravamos ou processamos o cartão além de repassar.
//
// Autenticação: mesmo statusToken (HMAC) usado em /pay-card e /status,
// pra qualquer um com o link do pedido poder pagar sem precisar de login.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { tokenizeAsaasCard } from '@/lib/asaas/tenant-payments'
import { AsaasError } from '@/lib/asaas/client'
import crypto from 'crypto'
import { z } from 'zod'

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

const tokenizeSchema = z.object({
  token: z.string().min(10),
  holderName: z.string().min(2),
  number: z.string().min(13).max(19),
  expiryMonth: z.string().length(2),
  expiryYear: z.string().min(2).max(4),
  ccv: z.string().min(3).max(4),
  customerName: z.string().min(2),
  customerCpf: z.string().transform((v) => v.replace(/\D/g, '')),
  customerEmail: z.string().email().optional(),
  customerPostalCode: z.string().transform((v) => v.replace(/\D/g, '')),
  customerAddressNumber: z.string().min(1),
  customerPhone: z.string().optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params

  let body: z.infer<typeof tokenizeSchema>
  try {
    body = tokenizeSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Dados do cartão inválidos' }, { status: 400 })
  }

  if (!validateStatusToken(orderId, body.token)) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  const order = await prisma.order.findFirst({ where: { id: orderId }, select: { tenantId: true } })
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

  const remoteIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'

  try {
    const result = await tokenizeAsaasCard({
      tenantId: order.tenantId,
      holderName: body.holderName,
      number: body.number,
      expiryMonth: body.expiryMonth,
      expiryYear: body.expiryYear.length === 2 ? `20${body.expiryYear}` : body.expiryYear,
      ccv: body.ccv,
      customerName: body.customerName,
      customerCpf: body.customerCpf,
      customerEmail: body.customerEmail,
      customerPostalCode: body.customerPostalCode,
      customerAddressNumber: body.customerAddressNumber,
      customerPhone: body.customerPhone,
      remoteIp,
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AsaasError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[asaas-tokenize-card] erro inesperado:', String(err))
    return NextResponse.json({ error: 'Não foi possível processar o cartão. Tente novamente.' }, { status: 500 })
  }
}
