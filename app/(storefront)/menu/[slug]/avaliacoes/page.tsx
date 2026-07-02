// app/(storefront)/menu/[slug]/avaliacoes/page.tsx
// Página pública de avaliações do restaurante — acessível pelo botão
// "Avaliações" no cardápio digital.

import { prisma } from '@/lib/db/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Star } from 'lucide-react'
import type { Metadata } from 'next'

export const revalidate = 60

interface PageProps { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return { title: `Avaliações - ${slug}` }
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function StorefrontReviewsPage({ params }: PageProps) {
  const { slug } = await params

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug }, { customDomain: slug }], isActive: true },
    select: { id: true, name: true, logo: true, primaryColor: true },
  })

  if (!tenant) notFound()

  const reviews = await prisma.review.findMany({
    where: { tenantId: tenant.id, isApproved: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, rating: true, comment: true, ownerReply: true,
      createdAt: true, customer: { select: { name: true } },
    },
  })

  const total = reviews.length
  const avg   = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }))

  const color = tenant.primaryColor ?? '#f97316'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <Link href={`/menu/${slug}`} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          {tenant.logo ? (
            <img src={tenant.logo} alt={tenant.name} className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: color }}>
              {tenant.name[0]}
            </div>
          )}
          <p className="font-semibold text-foreground text-sm">{tenant.name} · Avaliações</p>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Resumo */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 text-center">
          <p className="text-4xl font-black text-foreground">{avg.toFixed(1)}</p>
          <div className="flex items-center justify-center gap-0.5 mt-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="w-5 h-5" fill={i <= Math.round(avg) ? color : 'none'} stroke={color} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{total} avaliaç{total === 1 ? 'ão' : 'ões'}</p>
        </div>

        {/* Distribuição */}
        {total > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-2">
            {distribution.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-2 text-xs">
                <span className="w-8 text-muted-foreground">{star}★</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${total ? (count / total) * 100 : 0}%`, backgroundColor: color }} />
                </div>
                <span className="w-5 text-right text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Lista de avaliações */}
        {total === 0 ? (
          <div className="text-center py-10">
            <Star className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-2" />
            <p className="text-sm text-muted-foreground">Ainda não há avaliações.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{r.customer.name ?? 'Cliente'}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                </div>
                <div className="flex items-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-3.5 h-3.5" fill={i <= r.rating ? color : 'none'} stroke={color} />
                  ))}
                </div>
                {r.comment && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{r.comment}</p>
                )}
                {r.ownerReply && (
                  <div className="mt-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-foreground">Resposta do estabelecimento</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.ownerReply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
