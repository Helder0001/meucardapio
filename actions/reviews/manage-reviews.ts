'use server'
// actions/reviews/manage-reviews.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function approveReviewAction(reviewId: string, approve: boolean) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const review = await prisma.review.findFirst({
    where: { id: reviewId, tenantId: session.user.tenantId },
  })
  if (!review) return { error: 'Avaliação não encontrada' }

  await prisma.review.update({
    where: { id: reviewId },
    data:  {
      isApproved: approve,
      approvedAt: approve ? new Date() : null,
    },
  })

  revalidatePath('/dashboard/reviews')
  return { ok: true }
}

export async function replyReviewAction(reviewId: string, reply: string) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const parsed = z.string().min(1).max(500).safeParse(reply)
  if (!parsed.success) return { error: 'Resposta inválida' }

  const review = await prisma.review.findFirst({
    where: { id: reviewId, tenantId: session.user.tenantId },
  })
  if (!review) return { error: 'Avaliação não encontrada' }

  await prisma.review.update({
    where: { id: reviewId },
    data:  { ownerReply: parsed.data, repliedAt: new Date() },
  })

  revalidatePath('/dashboard/reviews')
  return { ok: true }
}

export async function deleteReviewAction(reviewId: string) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const review = await prisma.review.findFirst({
    where: { id: reviewId, tenantId: session.user.tenantId },
  })
  if (!review) return { error: 'Avaliação não encontrada' }

  await prisma.review.delete({ where: { id: reviewId } })

  revalidatePath('/dashboard/reviews')
  return { ok: true }
}
