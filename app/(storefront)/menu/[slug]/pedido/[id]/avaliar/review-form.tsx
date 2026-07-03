'use client'
// app/(storefront)/menu/[slug]/pedido/[id]/avaliar/review-form.tsx

import { useState, useTransition } from 'react'
import { submitReviewAction } from '@/actions/reviews/submit-review'
import { Star, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

const RATING_LABELS: Record<number, string> = {
  1: '😞 Muito ruim',
  2: '😕 Ruim',
  3: '😐 Regular',
  4: '😊 Bom',
  5: '🤩 Excelente!',
}

interface ReviewFormProps {
  orderId:  string
  tenantId: string
}

export function ReviewForm({ orderId, tenantId }: ReviewFormProps) {
  const [rating,    setRating]    = useState(0)
  const [hovered,   setHovered]   = useState(0)
  const [comment,   setComment]   = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isPending, start]        = useTransition()

  const handleSubmit = () => {
    if (rating === 0) { toast.error('Selecione uma nota'); return }
    start(async () => {
      const r = await submitReviewAction({ orderId, tenantId, rating, comment })
      if (r.error) { toast.error(r.error); return }
      setSubmitted(true)
    })
  }

  if (submitted) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
        <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Obrigado!</h2>
        <p className="text-muted-foreground text-sm">
          Sua avaliação foi enviada. Ela aparecerá no cardápio após aprovação.
        </p>
      </div>
    )
  }

  const displayRating = hovered || rating

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm space-y-6">
      {/* Estrelas */}
      <div className="text-center">
        <div className="flex justify-center gap-2 mb-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className="transition-transform hover:scale-110 active:scale-95"
            >
              <Star
                className={`h-10 w-10 transition-colors ${
                  star <= displayRating
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-200 dark:text-gray-700'
                }`}
              />
            </button>
          ))}
        </div>
        {displayRating > 0 && (
          <p className="text-sm font-medium text-foreground animate-fade-in">
            {RATING_LABELS[displayRating]}
          </p>
        )}
      </div>

      {/* Comentário */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Deixe um comentário (opcional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Como foi a comida? O atendimento? A entrega?"
          rows={4}
          maxLength={500}
          className="w-full px-3 py-2.5 border border-input rounded-xl bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
        />
        <p className="text-xs text-muted-foreground text-right mt-1">
          {comment.length}/500
        </p>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isPending || rating === 0}
        className="w-full flex items-center justify-center gap-2 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold disabled:opacity-60 transition-colors"
      >
        {isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
        ) : (
          'Enviar avaliação'
        )}
      </button>
    </div>
  )
}
