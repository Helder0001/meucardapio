'use client'

// app/assinatura/subscription-card-form.tsx
//
// Mesmo padrão do components/storefront/card-payment-form.tsx (Card Payment
// Brick do MP.js), mas aqui o token do cartão vai pra
// reactivateSubscriptionAction, que cria/autoriza um preapproval (assinatura
// recorrente) em vez de um pagamento avulso — assinatura no Mercado Pago só
// existe com cartão, então é por isso que PIX não aparece aqui.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react'
import { reactivateSubscriptionAction } from '@/actions/billing/reactivate-subscription'

declare global {
  interface Window {
    MercadoPago?: any
  }
}

interface SubscriptionCardFormProps {
  amount: number
  publicKey: string
}

type LoadState = 'loading-sdk' | 'ready' | 'submitting' | 'error' | 'success'

export function SubscriptionCardForm({ amount, publicKey }: SubscriptionCardFormProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const brickControllerRef = useRef<any>(null)
  const [state, setState] = useState<LoadState>('loading-sdk')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timeoutId = setTimeout(() => {
      if (!cancelled && state === 'loading-sdk') {
        setState('error')
        setErrorMessage('O formulário de pagamento demorou demais para carregar. Atualize a página e tente novamente.')
      }
    }, 12_000)

    async function init() {
      if (!publicKey) {
        setState('error')
        setErrorMessage('Pagamento não configurado. Contate o suporte.')
        return
      }

      if (!window.MercadoPago) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://sdk.mercadopago.com/js/v2'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Falha ao carregar SDK do Mercado Pago'))
          document.body.appendChild(script)
        })
      }

      if (cancelled || !containerRef.current) return

      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' })
      const bricksBuilder = mp.bricks()

      const controller = await bricksBuilder.create('cardPayment', containerRef.current.id, {
        initialization: { amount },
        customization: {
          visual: { style: { theme: 'default' } },
          paymentMethods: { maxInstallments: 1 }, // assinatura recorrente: sempre à vista por ciclo
        },
        callbacks: {
          onReady: () => {
            clearTimeout(timeoutId)
            if (!cancelled) setState('ready')
          },
          onError: (error: any) => {
            clearTimeout(timeoutId)
            console.error('[subscription-card-form]', error)
            if (!cancelled) {
              setState('error')
              setErrorMessage('Erro ao carregar o formulário de cartão. Atualize a página e tente novamente.')
            }
          },
          onSubmit: async (cardFormData: any) => {
            setState('submitting')
            setErrorMessage(null)

            const result = await reactivateSubscriptionAction({
              cardToken: cardFormData.token,
              payerEmail: cardFormData.payer?.email,
              payerCpf: cardFormData.payer?.identification?.number ?? '',
              cardholderName: cardFormData.cardholderName ?? '',
            })

            if (result.error) {
              setState('ready')
              setErrorMessage(result.error)
              return
            }

            setState('success')
            router.push('/dashboard')
            router.refresh()
          },
        },
      })

      brickControllerRef.current = controller
    }

    init().catch((err) => {
      console.error('[subscription-card-form] erro fatal na inicialização:', err)
      if (!cancelled) {
        setState('error')
        setErrorMessage('Não foi possível carregar o pagamento com cartão.')
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      brickControllerRef.current?.unmount?.()
    }
  }, [publicKey, amount]) // eslint-disable-line

  return (
    <div className="text-left">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-neutral-400" />
        <p className="text-xs text-neutral-500">Seus dados são processados de forma segura pelo Mercado Pago</p>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-600 mb-3">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      {state === 'loading-sdk' && (
        <div className="flex items-center justify-center py-10 text-neutral-400 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando formulário seguro...
        </div>
      )}

      {(state === 'submitting' || state === 'success') && (
        <div className="flex items-center justify-center py-3 text-neutral-500 text-sm gap-2 mb-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {state === 'success' ? 'Assinatura ativada! Redirecionando...' : 'Ativando assinatura...'}
        </div>
      )}

      <div id="subscriptionCardPaymentBrick" ref={containerRef} />
    </div>
  )
}
