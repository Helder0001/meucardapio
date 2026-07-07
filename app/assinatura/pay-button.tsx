'use client'

// app/assinatura/pay-button.tsx

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { reactivateSubscriptionAction } from '@/actions/billing/reactivate-subscription'

export function PayButton() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await reactivateSubscriptionAction('MONTHLY')

      if (result.error) {
        setError(result.error)
        return
      }

      if (result.pixInitPoint) {
        window.location.href = result.pixInitPoint
      } else {
        setError('Não foi possível gerar o link de pagamento. Tente novamente.')
      }
    })
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium py-3 px-6 transition-colors"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Gerando pagamento...
          </>
        ) : (
          'Pagar agora'
        )}
      </button>
      {error && (
        <p className="mt-3 text-sm text-red-600 text-center">{error}</p>
      )}
    </div>
  )
}
