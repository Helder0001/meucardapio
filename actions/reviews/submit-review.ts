'use server'
// actions/reviews/submit-review.ts

import { prisma } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  orderId:  z.string().cuid(),
  tenantId: z.string().cuid(),
  rating:   z.number().int().min(1).max(5),
  comment:  z.string().max(500).optional(),
})

export async function submitReviewAction(input: {
  orderId: string; tenantId: string; rating: number; comment: string
}) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { error: 'Dados inválidos' }

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
