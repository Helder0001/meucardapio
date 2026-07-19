'use client'
// components/storefront/efi-card-payment-form.tsx
//
// Formulário de pagamento com cartão via Efí — diferente do MP (que tem o
// Card Payment Brick, um componente pronto que desenha a própria UI), a
// Efí só oferece uma lib de TOKENIZAÇÃO (Efí.js): os campos do formulário
// são nossos, e só o passo final (gerar o payment_token a partir dos
// dados do cartão) passa pela lib deles, no navegador do cliente — os
// dados do cartão em si nunca chegam ao nosso servidor, só o token.
//
// Mesmo padrão de tokenização já usado em app/(auth)/register/register-form.tsx
// e app/assinatura/subscription-card-form.tsx.

import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react'
import { formatCpf, isValidCpf, onlyDigits } from '@/lib/utils/cpf'

declare global {
  interface Window {
    EfiPay?: any
  }
}

interface EfiCardPaymentFormProps {
  orderId: string
  amount: number
  accountIdentifier: string
  sandbox: boolean
  color: string
  statusToken: string
  onSuccess: (result: { status: string; cardLastDigits?: string }) => void
}

type LoadState = 'loading-sdk' | 'ready' | 'submitting' | 'error'

const EFI_SCRIPT_SRC = '/vendor/payment-token-efi.js'

function formatCardNumber(value: string): string {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

function formatExpiry(value: string): string {
  const digits = onlyDigits(value).slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function EfiCardPaymentForm({
  orderId,
  amount,
  accountIdentifier,
  sandbox,
  color,
  statusToken,
  onSuccess,
}: EfiCardPaymentFormProps) {
  const [state, setState] = useState<LoadState>('loading-sdk')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    cancelledRef.current = false
    const timeoutId = setTimeout(() => {
      if (!cancelledRef.current && state === 'loading-sdk') {
        setState('error')
        setErrorMessage('O formulário de pagamento demorou demais para carregar. Tente outra forma de pagamento ou avise o restaurante.')
      }
    }, 12_000)

    async function loadSdk() {
      if (!window.EfiPay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = EFI_SCRIPT_SRC
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Falha ao carregar SDK da Efí'))
          document.body.appendChild(script)
        })
      }
      if (!cancelledRef.current && window.EfiPay?.CreditCard) {
        clearTimeout(timeoutId)
        setState('ready')
      }
    }

    loadSdk().catch((err) => {
      console.error('[efi-card-payment-form] erro ao carregar SDK:', err)
      if (!cancelledRef.current) {
        setState('error')
        setErrorMessage('Não foi possível carregar o formulário de pagamento.')
      }
    })

    return () => {
      cancelledRef.current = true
      clearTimeout(timeoutId)
    }
  }, []) // eslint-disable-line

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    const cardDigits = onlyDigits(cardNumber)
    const [expMonth, expYear] = expiry.split('/')

    if (cardDigits.length < 13) return setErrorMessage('Número do cartão inválido.')
    if (!expMonth || !expYear || expYear.length < 2) return setErrorMessage('Informe a validade do cartão (MM/AA).')
    if (!cvv || cvv.length < 3) return setErrorMessage('CVV inválido.')
    if (!cardholderName.trim()) return setErrorMessage('Informe o nome impresso no cartão.')
    if (!isValidCpf(cpf)) return setErrorMessage('CPF inválido.')
    if (!email.includes('@')) return setErrorMessage('E-mail inválido.')

    if (!window.EfiPay?.CreditCard) {
      return setErrorMessage('O formulário de pagamento não carregou corretamente. Atualize a página e tente novamente.')
    }

    setState('submitting')

    try {
      const brand = await window.EfiPay.CreditCard.setCardNumber(cardDigits).verifyCardBrand()
      if (!brand || brand === 'undefined' || brand === 'unsupported') {
        setState('ready')
        return setErrorMessage('Bandeira do cartão não identificada ou não suportada.')
      }

      const tokenResult = await window.EfiPay.CreditCard
        .setAccount(accountIdentifier)
        .setEnvironment(sandbox ? 'sandbox' : 'production')
        .setCreditCardData({
          brand,
          number: cardDigits,
          cvv,
          expirationMonth: expMonth.padStart(2, '0'),
          expirationYear: expYear.length === 2 ? `20${expYear}` : expYear,
          reuse: false, // cobrança avulsa — token de uso único
        })
        .getPaymentToken()

      const res = await fetch(`/api/orders/${orderId}/pay-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: statusToken,
          cardToken: tokenResult.payment_token,
          installments: 1,
          paymentMethodId: 'efi', // não usado pela Efí, só satisfaz a validação compartilhada com o fluxo do MP
          customerEmail: email,
          customerCpf: onlyDigits(cpf),
          customerName: cardholderName.trim(),
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
    } catch (err: any) {
      setState('ready')
      const detail = err?.error_description || err?.error || err?.message
      setErrorMessage(detail ? `Não foi possível processar o cartão: ${detail}` : 'Não foi possível processar o pagamento. Tente novamente.')
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
      <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
            <ShieldCheck className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <p className="font-black text-gray-900 dark:text-white text-sm">Pague com cartão</p>
            <p className="text-xs text-gray-400">Seus dados são processados de forma segura pela Efí</p>
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

        {(state === 'ready' || state === 'submitting') && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Número do cartão</label>
              <input
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': color } as any}
                disabled={state === 'submitting'}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Validade</label>
                <input
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  inputMode="numeric"
                  placeholder="MM/AA"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2"
                  disabled={state === 'submitting'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">CVV</label>
                <input
                  value={cvv}
                  onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
                  inputMode="numeric"
                  placeholder="123"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2"
                  disabled={state === 'submitting'}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nome impresso no cartão</label>
              <input
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                placeholder="Como está no cartão"
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2"
                disabled={state === 'submitting'}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">CPF</label>
                <input
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2"
                  disabled={state === 'submitting'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">E-mail</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="seu@email.com"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2"
                  disabled={state === 'submitting'}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={state === 'submitting'}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-opacity disabled:opacity-60"
              style={{ background: color }}
            >
              {state === 'submitting' && <Loader2 className="h-4 w-4 animate-spin" />}
              {state === 'submitting' ? 'Processando pagamento...' : `Pagar R$ ${amount.toFixed(2).replace('.', ',')}`}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
