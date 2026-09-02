'use server'
// actions/reviews/submit-review.ts
//
// CORREÇÃO (IDOR): esta action não exigia nenhuma prova de posse do pedido —
// bastava conhecer orderId + tenantId (ambos visíveis na própria URL da
// página /menu/[slug]/pedido/[id]/avaliar) para postar uma avaliação em
// nome de qualquer cliente com pedido DELIVERED. Passa a exigir o mesmo
// token HMAC de curta duração já usado em /api/orders/[id]/status,
// /regenerate-pix e /payment-link, e adiciona rate limit por pedido.

import { prisma } from '@/lib/db/client'
import { z } from 'zod'
import crypto from 'crypto'
import { reviewLimiter } from '@/lib/security/rate-limit'

const schema = z.object({
  orderId:  z.string().cuid(),
  tenantId: z.string().cuid(),
  token:    z.string().min(1),
  rating:   z.number().int().min(1).max(5),
  comment:  z.string().max(500).optional(),
})

// Mesmo mecanismo usado em app/api/orders/[id]/status/route.ts e afins.
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

export async function submitReviewAction(input: {
  orderId: string; tenantId: string; token: string; rating: number; comment: string
}) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { error: 'Dados inválidos' }

  // Rate limit por pedido — trava tentativas repetidas/automatizadas.
  const { success } = await reviewLimiter.limit(parsed.data.orderId)
  if (!success) return { error: 'Muitas tentativas. Aguarde e tente novamente.' }

  if (!validateStatusToken(parsed.data.orderId, parsed.data.token)) {
    return { error: 'Pedido não encontrado' }
  }

  // Verificar que o pedido existe, foi entregue e pertence ao tenant
  const order = await prisma.order.findFirst({
    where: {
      id:       parsed.data.orderId,
      tenantId: parsed.data.tenantId,
      status:   'DELIVERED',
    },
    select: { id: true, customerId: true, review: { select: { id: true } } },
  })

  if (!order)        return { error: 'Pedido não encontrado' }
  if (!order.customerId) return { error: 'Cliente não identificado' }
  if (order.review)  return { error: 'Este pedido já foi avaliado' }

  await prisma.review.create({
    data: {
      tenantId:   parsed.data.tenantId,
      orderId:    parsed.data.orderId,
      customerId: order.customerId,
      rating:     parsed.data.rating,
      comment:    parsed.data.comment?.trim() || null,
      isApproved: false, // aguarda moderação do estabelecimento
    },
  })

  return { ok: true }
}
