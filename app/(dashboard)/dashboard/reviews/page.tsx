// app/(dashboard)/dashboard/reviews/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { ReviewsManager } from '@/components/dashboard/reviews-manager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Avaliações' }

export default async function ReviewsPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const tenantId = session.user.tenantId

  const [reviews, stats] = await Promise.all([
    prisma.review.findMany({
      where:   { tenantId },
      orderBy: { createdAt: 'desc' },
      take:    100,
      select: {
        id: true, rating: true, comment: true, ownerReply: true,
        isApproved: true, createdAt: true, repliedAt: true,
        customer: { select: { name: true, phone: true } },
        order:    { select: { orderNumber: true } },
      },
    }),
    prisma.review.groupBy({
      by:    ['rating'],
      where: { tenantId, isApproved: true },
      _count: { id: true },
    }),
  ])

  // Calcular média
  const approvedReviews = reviews.filter((r) => r.isApproved)
  const avgRating = approvedReviews.length > 0
    ? approvedReviews.reduce((s, r) => s + r.rating, 0) / approvedReviews.length
    : 0

  const ratingDist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: stats.find((s) => s.rating === star)?._count.id ?? 0,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Avaliações</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Gerencie as avaliações dos seus clientes
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 text-center">
          <div className="text-4xl font-bold text-foreground mb-1">
            {avgRating.toFixed(1)}
          </div>
          <div className="flex justify-center gap-0.5 mb-1">
            {[1,2,3,4,5].map((s) => (
              <span key={s} className={s <= Math.round(avgRating) ? 'text-yellow-400' : 'text-gray-200 dark:text-gray-700'}>
                ★
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{approvedReviews.length} avaliações</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 sm:col-span-2">
          <div className="space-y-1.5">
            {ratingDist.map(({ star, count }) => {
              const total = approvedReviews.length
              const pct   = total > 0 ? (count / total) * 100 : 0
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{star}★</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <ReviewsManager reviews={reviews} />
    </div>
  )
}
