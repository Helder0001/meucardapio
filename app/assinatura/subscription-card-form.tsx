'use client'

// app/assinatura/subscription-card-form.tsx
//
// MIGRAÇÃO MP → EFÍ: diferente do Card Payment Brick do Mercado Pago (que
// renderizava a própria UI dentro de um container e devolvia um token
// pronto), a lib de tokenização da Efí (`payment-token-efi`, carregada via
// CDN abaixo) só faz a criptografia dos dados de cartão no navegador — quem
// desenha os campos é a gente. Por isso este componente ganhou inputs de
// verdade (número, validade, CVV, nome do titular) que não existiam antes.
//
// Fluxo: EfiPay.CreditCard.setCardNumber(...).verifyCardBrand() identifica a
// bandeira → EfiPay.CreditCard.setAccount(...).setEnvironment(...)
// .setCreditCardData(...).getPaymentToken() gera o payment_token → esse
// token vai pra reactivateSubscriptionAction, que cria a assinatura na Efí
// (API Cobranças).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react'
import { reactivateSubscriptionAction } from '@/actions/billing/reactivate-subscription'
import { formatCpf, isValidCpf, onlyDigits } from '@/lib/utils/cpf'

declare global {
  interface Window {
    EfiPay?: any
  }
}

interface SubscriptionCardFormProps {
  amount: number
  accountIdentifier: string // "Identificador de Conta" da Efí (API > Introdução), NÃO é o client_id/secret
  sandbox: boolean
}

type LoadState = 'loading-sdk' | 'ready' | 'submitting' | 'error' | 'processing' | 'success'

// Mesma cautela de antes (era true pro MP, agora vale pra Efí também): a
// cobrança nasce "waiting"/"nova" e só o webhook (app/api/webhooks/efi/route.ts),
// ao confirmar o pagamento, vira o status pra ACTIVE de verdade — não dá pra
// redirecionar direto pro /dashboard só com a assinatura criada.
const POLL_INTERVAL_MS = 3_000
const POLL_MAX_ATTEMPTS = 40 // ~2 minutos

const EFI_SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/payment-token-efi/dist/payment-token-efi-umd.min.js'

async function checkSubscriptionActive(): Promise<boolean> {
  try {
    const res = await fetch('/api/billing/subscription-status', { cache: 'no-store' })
    if (!res.ok) return false
    const data = await res.json()
    return Boolean(data?.hasValidAccess)
  } catch {
    return false
  }
}

function formatCardNumber(value: string): string {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

const CURRENT_YEAR = new Date().getFullYear()
const EXPIRATION_YEARS = Array.from({ length: 13 }, (_, i) => String(CURRENT_YEAR + i))
const EXPIRATION_MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

export function SubscriptionCardForm({ amount, accountIdentifier, sandbox }: SubscriptionCardFormProps) {
  const router = useRouter()
  const [state, setState] = useState<LoadState>('loading-sdk')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [cardNumber, setCardNumber] = useState('')
  const [expirationMonth, setExpirationMonth] = useState('')
  const [expirationYear, setExpirationYear] = useState('')
  const [cvv, setCvv] = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [payerEmail, setPayerEmail] = useState('')
  const [payerCpf, setPayerCpf] = useState('')

  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    const timeoutId = setTimeout(() => {
      if (!cancelledRef.current && state === 'loading-sdk') {
        setState('error')
        setErrorMessage('O formulário de pagamento demorou demais para carregar. Atualize a página e tente novamente.')
      }
    }, 12_000)

    async function init() {
      if (!accountIdentifier) {
        setState('error')
        setErrorMessage('Pagamento não configurado. Contate o suporte.')
        return
      }

      if (!window.EfiPay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = EFI_SCRIPT_SRC
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Falha ao carregar SDK da Efí'))
          document.body.appendChild(script)
        })
      }

      // Alguns bloqueadores de anúncio / VPNs com filtro de conteúdo (comum
      // no Android — AdGuard, NextDNS etc.) bloqueiam silenciosamente esse
      // script: o evento onload dispara normalmente, mas `window.EfiPay`
      // nunca chega a existir de verdade. Sem essa checagem, o erro só
      // aparecia depois, na hora de gerar o payment_token, como um "Cannot
      // read properties of undefined" sem explicação nenhuma pro usuário.
      if (cancelledRef.current) return
      if (!window.EfiPay?.CreditCard) {
        setState('error')
        setErrorMessage(
          'Não foi possível carregar o script de pagamento. Se você usa bloqueador de anúncios ou uma VPN com filtro de conteúdo (ex.: AdGuard, NextDNS), tente desativar e recarregar a página.'
        )
        return
      }

      if (cancelledRef.current) return
      clearTimeout(timeoutId)
      setState('ready')
    }

    init().catch((err) => {
      console.error('[subscription-card-form] erro fatal na inicialização:', err)
      if (!cancelledRef.current) {
        setState('error')
        setErrorMessage('Não foi possível carregar o pagamento com cartão.')
      }
    })

    return () => {
      cancelledRef.current = true
      clearTimeout(timeoutId)
    }
  }, [accountIdentifier])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    const digits = onlyDigits(cardNumber)
    if (digits.length < 13) {
      setErrorMessage('Número do cartão inválido.')
      return
    }
    if (!expirationMonth || !expirationYear) {
      setErrorMessage('Informe a validade do cartão.')
      return
    }
    if (!cvv || cvv.length < 3) {
      setErrorMessage('CVV inválido.')
      return
    }
    if (!cardholderName.trim()) {
      setErrorMessage('Informe o nome impresso no cartão.')
      return
    }
    if (!payerEmail.trim()) {
      setErrorMessage('Informe um e-mail para o recibo.')
      return
    }
    if (!isValidCpf(payerCpf)) {
      setErrorMessage('CPF inválido.')
      return
    }

    setState('submitting')

    if (!window.EfiPay?.CreditCard) {
      setState('error')
      setErrorMessage(
        'O script de pagamento não carregou corretamente. Se você usa bloqueador de anúncios ou VPN com filtro de conteúdo, desative e recarregue a página.'
      )
      return
    }

    try {
      const brand = await window.EfiPay.CreditCard.setCardNumber(digits).verifyCardBrand()
      if (!brand || brand === 'undefined' || brand === 'unsupported') {
        setState('ready')
        setErrorMessage('Bandeira do cartão não identificada ou não suportada.')
        return
      }

      const tokenResult = await window.EfiPay.CreditCard
        .setAccount(accountIdentifier)
        .setEnvironment(sandbox ? 'sandbox' : 'production')
        .setCreditCardData({
          brand,
          number: digits,
          cvv,
          expirationMonth,
          expirationYear,
          reuse: true, // assinatura recorrente precisa reutilizar o payment_token nas cobranças seguintes
        })
        .getPaymentToken()

      const result = await reactivateSubscriptionAction({
        cardToken: tokenResult.payment_token,
        payerEmail: payerEmail.trim(),
        payerCpf,
        cardholderName: cardholderName.trim(),
      })

      if (result.error) {
        setState('ready')
        setErrorMessage(result.error)
        return
      }

      setState('processing')

      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        if (cancelledRef.current) return
        const isActive = await checkSubscriptionActive()
        if (isActive) {
          if (cancelledRef.current) return
          setState('success')
          router.push('/dashboard')
          router.refresh()
          return
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }

      // Passou do tempo razoável de espera sem confirmação — não é
      // necessariamente um erro (o banco emissor às vezes demora mais);
      // só avisamos e paramos de bloquear a tela, sem mandar pro dashboard
      // (ele bloquearia de novo).
      if (!cancelledRef.current) {
        setState('error')
        setErrorMessage(
          'Seu pagamento ainda está sendo processado — isso pode levar alguns minutos em análises mais demoradas. Você pode atualizar esta página daqui a pouco para verificar se já foi confirmado.'
        )
      }
    } catch (err: any) {
      console.error('[subscription-card-form][efi] erro ao gerar payment_token:', err)
      setState('ready')
      const detail =
        err?.error_description || err?.error || err?.message || (typeof err === 'string' ? err : null)
      setErrorMessage(
        detail
          ? `Não foi possível processar o cartão: ${detail}`
          : 'Não foi possível processar o cartão. Confira os dados e tente novamente.'
      )
    }
  }

  const isBusy = state === 'submitting' || state === 'processing' || state === 'success'
  const inputClass =
    'w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 disabled:bg-neutral-50 disabled:text-neutral-400'

  return (
    <div className="text-left">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-neutral-400" />
        <p className="text-xs text-neutral-500">Seus dados são processados de forma segura pela Efí</p>
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

      {isBusy && (
        <div className="flex items-center justify-center py-3 text-neutral-500 text-sm gap-2 mb-2 text-center">
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          {state === 'submitting' && 'Enviando dados do cartão...'}
          {state === 'processing' && 'Confirmando pagamento... isso pode levar alguns segundos.'}
          {state === 'success' && 'Pagamento confirmado! Redirecionando...'}
        </div>
      )}

      {state !== 'loading-sdk' && !isBusy && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Número do cartão</label>
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              disabled={isBusy}
              maxLength={23}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Mês</label>
              <select
                className={inputClass}
                value={expirationMonth}
                onChange={(e) => setExpirationMonth(e.target.value)}
                disabled={isBusy}
              >
                <option value="">MM</option>
                {EXPIRATION_MONTHS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Ano</label>
              <select
                className={inputClass}
                value={expirationYear}
                onChange={(e) => setExpirationYear(e.target.value)}
                disabled={isBusy}
              >
                <option value="">AAAA</option>
                {EXPIRATION_YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">CVV</label>
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="000"
                value={cvv}
                onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
                disabled={isBusy}
                maxLength={4}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-neutral-500 mb-1">Nome no cartão</label>
            <input
              className={inputClass}
              placeholder="Como está impresso no cartão"
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value)}
              disabled={isBusy}
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-500 mb-1">E-mail para recibo</label>
            <input
              className={inputClass}
              type="email"
              placeholder="voce@exemplo.com"
              value={payerEmail}
              onChange={(e) => setPayerEmail(e.target.value)}
              disabled={isBusy}
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-500 mb-1">CPF do titular</label>
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={payerCpf}
              onChange={(e) => setPayerCpf(formatCpf(e.target.value))}
              disabled={isBusy}
              maxLength={14}
            />
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="w-full rounded-lg bg-neutral-900 text-white text-sm font-medium py-2.5 mt-2 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Pagar R$ {amount.toFixed(2).replace('.', ',')}
          </button>
        </form>
      )}
    </div>
  )
}
