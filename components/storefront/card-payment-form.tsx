'use client'
// components/storefront/card-payment-form.tsx
//
// Formulário de pagamento com cartão usando o "Card Payment Brick" do
// Mercado Pago — um componente pronto e mantido pelo MP que: renderiza os
// campos (número, validade, CVV, parcelas, documento), tokeniza os dados no
// browser do cliente (nunca passam pelo nosso servidor) e devolve tudo já
// formatado para a chamada de pagamento.
//
// Documentação: https://github.com/mercadopago/sdk-js

import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react'

declare global {
  interface Window {
    MercadoPago?: any
  }
}

interface CardPaymentFormProps {
  orderId: string
  amount: number
  publicKey: string
  color: string
  statusToken: string
  onSuccess: (result: { status: string; cardLastDigits?: string }) => void
}

type LoadState = 'loading-sdk' | 'ready' | 'submitting' | 'error'

export function CardPaymentForm({ orderId, amount, publicKey, color, statusToken, onSuccess }: CardPaymentFormProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const brickControllerRef = useRef<any>(null)
  const [state, setState] = useState<LoadState>('loading-sdk')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timeoutId = setTimeout(() => {
      if (!cancelled && state === 'loading-sdk') {
        setState('error')
        setErrorMessage('O formulário de pagamento demorou demais para carregar. Isso geralmente significa que o Mercado Pago ainda não foi conectado por este estabelecimento. Tente outra forma de pagamento ou avise o restaurante.')
      }
    }, 12_000)

    async function init() {
      console.log('[card-payment-form] iniciando, publicKey:', publicKey?.slice(0, 12), 'amount:', amount)

      // Carrega o script do MP.js se ainda não estiver no documento
      if (!window.MercadoPago) {
        console.log('[card-payment-form] carregando SDK sdk.mercadopago.com/js/v2...')
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://sdk.mercadopago.com/js/v2'
          script.onload = () => {
            console.log('[card-payment-form] SDK carregado com sucesso')
            resolve()
          }
          script.onerror = (e) => {
            console.error('[card-payment-form] falha ao carregar script do MP:', e)
            reject(new Error('Falha ao carregar SDK do Mercado Pago'))
          }
          document.body.appendChild(script)
        })
      } else {
        console.log('[card-payment-form] SDK já estava carregado')
      }

      if (cancelled || !containerRef.current) {
        console.log('[card-payment-form] cancelado ou sem container, abortando')
        return
      }

      console.log('[card-payment-form] criando instância MercadoPago e brick...')
      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' })
      const bricksBuilder = mp.bricks()

      const controller = await bricksBuilder.create('cardPayment', containerRef.current.id, {
        initialization: { amount },
        customization: {
          visual: {
            style: { theme: 'default' },
          },
          paymentMethods: {
            maxInstallments: 12,
          },
        },
        callbacks: {
          onReady: () => {
            clearTimeout(timeoutId)
            if (!cancelled) setState('ready')
          },
          onError: (error: any) => {
            clearTimeout(timeoutId)
            console.error('[card-payment-brick]', error)
            if (!cancelled) {
              setState('error')
              setErrorMessage('Erro ao carregar o formulário de cartão. Atualize a página e tente novamente.')
            }
          },
          onSubmit: async (cardFormData: any) => {
            setState('submitting')
            setErrorMessage(null)

            try {
              const res = await fetch(`/api/orders/${orderId}/pay-card`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  token: statusToken,
                  cardToken: cardFormData.token,
                  installments: cardFormData.installments,
                  // BUG: o Brick do MP retorna esses campos em snake_case
                  // (payment_method_id, issuer_id), não camelCase — por isso
                  // vinham undefined e a nossa própria validação rejeitava
                  // o pagamento antes mesmo de tentar cobrar de verdade.
                  paymentMethodId: cardFormData.payment_method_id,
                  issuerId: cardFormData.issuer_id,
                  customerEmail: cardFormData.payer?.email,
                  customerCpf: cardFormData.payer?.identification?.number,
                }),
              })

              const data = await res.json()

              if (!res.ok) {
                setState('ready')
                setErrorMessage(data.error ?? 'Pagamento não autorizado. Verifique os dados do cartão.')
                return
              }

              if (data.status === 'rejected') {
                setState('ready')
                setErrorMessage('Pagamento recusado pela operadora do cartão. Tente outro cartão.')
                return
              }

              onSuccess({ status: data.status, cardLastDigits: data.cardLastDigits })
            } catch (err) {
              setState('ready')
              setErrorMessage('Não foi possível processar o pagamento. Tente novamente.')
            }
          },
        },
      })

      brickControllerRef.current = controller
      console.log('[card-payment-form] brick controller criado:', !!controller)
    }

    init().catch((err) => {
      console.error('[card-payment-form] erro fatal na inicialização:', err)
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
  }, [publicKey, amount, orderId]) // eslint-disable-line

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
      <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
            <ShieldCheck className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <p className="font-black text-gray-900 dark:text-white text-sm">Pague com cartão</p>
            <p className="text-xs text-gray-400">Seus dados são processados de forma segura pelo Mercado Pago</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        {errorMessage && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 px-3 py-2.5 text-xs text-red-600 dark:text-red-400 mb-4">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            {errorMessage}
          </div>
        )}

        {state === 'loading-sdk' && (
          <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando formulário seguro...
          </div>
        )}

        {state === 'submitting' && (
          <div className="flex items-center justify-center py-3 text-gray-500 text-sm gap-2 mb-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processando pagamento...
          </div>
        )}

        <div id={`cardPaymentBrick_${orderId}`} ref={containerRef} />
      </div>
    </div>
  )
}
