'use client'
// components/dashboard/reviews-manager.tsx

import { useState, useTransition } from 'react'
import { approveReviewAction, replyReviewAction, deleteReviewAction } from '@/actions/reviews/manage-reviews'
import { formatRelative, formatOrderNumber, formatPhone } from '@/lib/utils/format'
import { CheckCircle2, XCircle, MessageSquare, Trash2, Loader2, Star } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Review {
  id: string; rating: number; comment: string | null; ownerReply: string | null
  isApproved: boolean; createdAt: Date; repliedAt: Date | null
  customer: { name: string | null; phone: string }
  order:    { orderNumber: number }
}

const STAR_COLORS: Record<number, string> = {
  5: 'text-green-500',
  4: 'text-emerald-500',
  3: 'text-yellow-500',
  2: 'text-orange-500',
  1: 'text-red-500',
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className={cn('flex gap-0.5', STAR_COLORS[rating] ?? 'text-gray-400')}>
      {[1,2,3,4,5].map((s) => (
        <Star key={s} className={cn('h-3.5 w-3.5', s <= rating ? 'fill-current' : 'opacity-20')} />
      ))}
    </div>
  )
}

export function ReviewsManager({ reviews: initial }: { reviews: Review[] }) {
  const [reviews,     setReviews]     = useState(initial)
  const [replyingId,  setReplyingId]  = useState<string | null>(null)
  const [replyText,   setReplyText]   = useState('')
  const [filterTab,   setFilterTab]   = useState<'pending' | 'approved' | 'all'>('pending')
  const [isPending,   start]          = useTransition()

  const handleApprove = (id: string, approve: boolean) => {
    start(async () => {
      const r = await approveReviewAction(id, approve)
      if (r.error) { toast.error(r.error); return }
      setReviews((p) => p.map((rev) => rev.id === id ? { ...rev, isApproved: approve } : rev))
      toast.success(approve ? 'Avaliação aprovada e publicada!' : 'Avaliação ocultada')
    })
  }

  const handleReply = (id: string) => {
    if (!replyText.trim()) { toast.error('Escreva uma resposta'); return }
    start(async () => {
      const r = await replyReviewAction(id, replyText.trim())
      if (r.error) { toast.error(r.error); return }
      setReviews((p) => p.map((rev) =>
        rev.id === id ? { ...rev, ownerReply: replyText.trim(), repliedAt: new Date() } : rev
      ))
      setReplyingId(null)
      setReplyText('')
      toast.success('Resposta publicada!')
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Excluir esta avaliação permanentemente?')) return
    start(async () => {
      const r = await deleteReviewAction(id)
      if (r.error) { toast.error(r.error); return }
      setReviews((p) => p.filter((rev) => rev.id !== id))
      toast.success('Avaliação excluída')
    })
  }

  const filtered = reviews.filter((r) =>
    filterTab === 'all'      ? true :
    filterTab === 'pending'  ? !r.isApproved :
    r.isApproved
  )

  const pendingCount  = reviews.filter((r) => !r.isApproved).length
  const approvedCount = reviews.filter((r) =>  r.isApproved).length

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        {([
          { key: 'pending',  label: `Pendentes (${pendingCount})` },
          { key: 'approved', label: `Aprovadas (${approvedCount})` },
          { key: 'all',      label: `Todas (${reviews.length})` },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setFilterTab(key)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              filterTab === key
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            )}>
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Star className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">
            {filterTab === 'pending' ? 'Nenhuma avaliação aguardando aprovação' :
             filterTab === 'approved' ? 'Nenhuma avaliação aprovada' :
             'Nenhuma avaliação recebida ainda'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((review) => (
            <div key={review.id}
              className={cn(
                'bg-card border rounded-xl p-5 transition-all',
                review.isApproved ? 'border-border' : 'border-amber-200 dark:border-amber-800'
              )}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Stars rating={review.rating} />
                  <span className="text-xs text-muted-foreground">
                    {review.customer.name ?? formatPhone(review.customer.phone)}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    Pedido {formatOrderNumber(review.order.orderNumber)}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(review.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {!review.isApproved ? (
                    <button onClick={() => handleApprove(review.id, true)} disabled={isPending}
                      title="Aprovar e publicar"
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/50 disabled:opacity-40 transition-colors">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
                    </button>
                  ) : (
                    <button onClick={() => handleApprove(review.id, false)} disabled={isPending}
                      title="Ocultar avaliação"
                      className="p-1.5 text-muted-foreground hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-md transition-colors disabled:opacity-40">
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => { setReplyingId(review.id); setReplyText(review.ownerReply ?? '') }}
                    title="Responder"
                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(review.id)} disabled={isPending}
                    title="Excluir"
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-40">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Comentário do cliente */}
              {review.comment ? (
                <p className="text-sm text-foreground mb-3 leading-relaxed">
                  "{review.comment}"
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic mb-3">
                  Sem comentário
                </p>
              )}

              {/* Resposta do estabelecimento */}
              {review.ownerReply && replyingId !== review.id && (
                <div className="bg-muted/50 rounded-lg px-3 py-2.5 border-l-2 border-primary/40">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Sua resposta:</p>
                  <p className="text-sm text-foreground">{review.ownerReply}</p>
                </div>
              )}

              {/* Formulário de resposta */}
              {replyingId === review.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escreva sua resposta ao cliente..."
                    rows={3}
                    maxLength={500}
                    className="w-full px-3 py-2.5 border border-input rounded-xl bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setReplyingId(null); setReplyText('') }}
                      className="px-3 py-1.5 text-xs border border-input rounded-lg hover:bg-muted transition-colors">
                      Cancelar
                    </button>
                    <button onClick={() => handleReply(review.id)} disabled={isPending || !replyText.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
                      {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                      Publicar resposta
                    </button>
                  </div>
                </div>
              )}

              {/* Badge de status */}
              {!review.isApproved && (
                <div className="mt-3">
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                    Aguardando aprovação
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
