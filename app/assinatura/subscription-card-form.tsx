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
import {
  Loader2, AlertCircle, ShieldCheck, Check, CreditCard, Calendar,
  Lock, User, Mail, Phone, IdCard, Sparkles, MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { reactivateSubscriptionAction } from '@/actions/billing/reactivate-subscription'
import { formatCpf, isValidCpf, onlyDigits } from '@/lib/utils/cpf'
import {
  monthlyPrice, annualTotalPrice, annualMonthlyEquivalent, chargeAmount,
  PLAN_LABEL, type PlanTier, type BillingCycle,
} from '@/lib/billing/pricing'

declare global {
  interface Window {
    EfiPay?: any
  }
}

interface SubscriptionCardFormProps {
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

// Servido do próprio domínio (public/vendor/), não do CDN da Efí
// (cdn.jsdelivr.net) — alguns bloqueadores de anúncio e VPNs com filtro de
// conteúdo (comum no Android: AdGuard, NextDNS etc.) bloqueiam
// silenciosamente scripts de terceiros relacionados a pagamento/tokenização,
// derrubando o checkout sem erro nenhum visível pro usuário. Servindo do
// mesmo domínio do site, o script não cai em listas de bloqueio de
// terceiros. Arquivo é a lib oficial da Efí (payment-token-efi v3.4.1,
// MIT), sem nenhuma modificação — só copiada localmente.
const EFI_SCRIPT_SRC = '/vendor/payment-token-efi.js'

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

// formatPhone("11999999999") → "(11) 99999-9999" — máscara enquanto digita.
// Diferente de lib/utils/format.ts (que só formata pra exibição de um valor
// já completo), essa aplica progressivamente a cada tecla.
function formatPhoneInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ''
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

const CURRENT_YEAR = new Date().getFullYear()
const EXPIRATION_YEARS = Array.from({ length: 13 }, (_, i) => String(CURRENT_YEAR + i))
const EXPIRATION_MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

export function SubscriptionCardForm({ accountIdentifier, sandbox }: SubscriptionCardFormProps) {
  const router = useRouter()
  const [state, setState] = useState<LoadState>('loading-sdk')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // CORREÇÃO: renovação agora exige ESCOLHER o plano — antes ia direto pro
  // formulário de cartão com um valor fixo (o único plano que existia).
  const [plan, setPlan] = useState<PlanTier>('NORMAL')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY')
  const amount = chargeAmount(plan, billingCycle)

  const [cardNumber, setCardNumber] = useState('')
  const [expirationMonth, setExpirationMonth] = useState('')
  const [expirationYear, setExpirationYear] = useState('')
  const [cvv, setCvv] = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [payerEmail, setPayerEmail] = useState('')
  const [payerPhone, setPayerPhone] = useState('')
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
    const phoneDigits = onlyDigits(payerPhone)
    if (phoneDigits.length < 10) {
      setErrorMessage('Informe um telefone válido, com DDD.')
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
        plan,
        billingCycle,
        cardToken: tokenResult.payment_token,
        payerEmail: payerEmail.trim(),
        payerPhone: phoneDigits,
        payerCpf,
        cardholderName: cardholderName.trim(),
        cardLast4: digits.slice(-4),
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
    'w-full rounded-lg border border-neutral-200 pl-9 pr-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 focus:border-brand-400 disabled:bg-neutral-50 disabled:text-neutral-400 transition-colors'
  const fieldWrapClass = 'relative'
  const fieldIconClass = 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400'

  return (
    <div className="text-left">
      {errorMessage && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-600 mb-4">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      {state === 'loading-sdk' && (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-400 text-sm gap-2.5">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando formulário seguro...
        </div>
      )}

      {isBusy && (
        <div className="flex flex-col items-center justify-center py-8 text-neutral-600 text-sm gap-2.5 mb-2 text-center">
          <Loader2 className="h-5 w-5 animate-spin flex-shrink-0 text-brand-500" />
          {state === 'submitting' && 'Enviando dados do cartão...'}
          {state === 'processing' && 'Confirmando pagamento... isso pode levar alguns segundos.'}
          {state === 'success' && 'Pagamento confirmado! Redirecionando...'}
        </div>
      )}

      {state !== 'loading-sdk' && !isBusy && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* CORREÇÃO: seleção de plano — Normal (sem WhatsApp) ou Pro
              (com WhatsApp automático), cada um mensal ou anual (15% off). */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-2 uppercase tracking-wide">Escolha seu plano</label>
            <div className="grid grid-cols-2 gap-2.5">
              {(['NORMAL', 'PRO'] as const).map((p) => {
                const selected = plan === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    disabled={isBusy}
                    className={cn(
                      'relative text-left rounded-xl border-2 px-3.5 py-3 transition-all',
                      selected
                        ? 'border-brand-500 bg-brand-50/60 shadow-sm'
                        : 'border-neutral-200 hover:border-neutral-300'
                    )}
                  >
                    {p === 'PRO' && (
                      <span className="absolute -top-2.5 right-3 inline-flex items-center gap-0.5 rounded-full bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5">
                        <Sparkles className="h-2.5 w-2.5" /> Mais popular
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-neutral-900">{PLAN_LABEL[p]}</span>
                      <span className={cn(
                        'flex items-center justify-center h-4 w-4 rounded-full border-2 flex-shrink-0',
                        selected ? 'border-brand-500 bg-brand-500' : 'border-neutral-300'
                      )}>
                        {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                      </span>
                    </div>
                    <p className="flex items-center gap-1 text-[11px] text-neutral-500 mt-1">
                      {p === 'PRO' && <MessageCircle className="h-3 w-3 text-emerald-500 flex-shrink-0" />}
                      {p === 'PRO' ? 'Tudo, incluindo WhatsApp automático' : 'Tudo, exceto WhatsApp automático'}
                    </p>
                    <p className="text-base font-extrabold text-neutral-900 mt-1.5">
                      R$ {monthlyPrice(p).toFixed(2).replace('.', ',')}
                      <span className="text-xs font-normal text-neutral-500">/mês</span>
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-2 uppercase tracking-wide">Ciclo de cobrança</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setBillingCycle('MONTHLY')}
                disabled={isBusy}
                className={cn(
                  'rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all',
                  billingCycle === 'MONTHLY'
                    ? 'border-brand-500 bg-brand-50/60 text-neutral-900'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                )}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('ANNUAL')}
                disabled={isBusy}
                className={cn(
                  'rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all relative',
                  billingCycle === 'ANNUAL'
                    ? 'border-brand-500 bg-brand-50/60 text-neutral-900'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                )}
              >
                Anual
                <span className="ml-1.5 inline-block text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-1.5 py-0.5">-15%</span>
              </button>
            </div>
            {billingCycle === 'ANNUAL' && (
              <p className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 mt-2">
                <Sparkles className="h-3 w-3 flex-shrink-0" />
                R$ {annualTotalPrice(plan).toFixed(2).replace('.', ',')} cobrado uma vez por ano
                (equivale a R$ {annualMonthlyEquivalent(plan).toFixed(2).replace('.', ',')}/mês)
              </p>
            )}
          </div>

          <div className="border-t border-neutral-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Dados do cartão</p>
            <div className={fieldWrapClass}>
              <CreditCard className={fieldIconClass} />
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
              <div className="col-span-2">
                <label className="block text-[11px] text-neutral-500 mb-1">Validade</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    className="w-full rounded-lg border border-neutral-200 px-2 py-2.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500/15 focus:border-brand-400 disabled:bg-neutral-50 disabled:text-neutral-400"
                    value={expirationMonth}
                    onChange={(e) => setExpirationMonth(e.target.value)}
                    disabled={isBusy}
                  >
                    <option value="">MM</option>
                    {EXPIRATION_MONTHS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-lg border border-neutral-200 px-1.5 py-2.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500/15 focus:border-brand-400 disabled:bg-neutral-50 disabled:text-neutral-400"
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
              </div>
              <div className="col-span-1">
                <label className="block text-[11px] text-neutral-500 mb-1">CVV</label>
                <div className={fieldWrapClass}>
                  <Lock className={fieldIconClass} />
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
            </div>

            <div className={fieldWrapClass}>
              <User className={fieldIconClass} />
              <input
                className={inputClass}
                placeholder="Nome impresso no cartão"
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                disabled={isBusy}
              />
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Seus dados</p>
            <div className={fieldWrapClass}>
              <Mail className={fieldIconClass} />
              <input
                className={inputClass}
                type="email"
                placeholder="E-mail para recibo"
                value={payerEmail}
                onChange={(e) => setPayerEmail(e.target.value)}
                disabled={isBusy}
              />
            </div>

            <div className={fieldWrapClass}>
              <Phone className={fieldIconClass} />
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="Telefone com DDD"
                value={payerPhone}
                onChange={(e) => setPayerPhone(formatPhoneInput(e.target.value))}
                disabled={isBusy}
                maxLength={15}
              />
            </div>

            <div className={fieldWrapClass}>
              <IdCard className={fieldIconClass} />
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="CPF do titular"
                value={payerCpf}
                onChange={(e) => setPayerCpf(formatCpf(e.target.value))}
                disabled={isBusy}
                maxLength={14}
              />
            </div>
          </div>

          {/* Resumo + CTA — total em destaque logo acima do botão, pra
              deixar claro o que vai ser cobrado antes de confirmar. */}
          <div className="border-t border-neutral-100 pt-4">
            <div className="flex items-center justify-between mb-3 text-sm">
              <span className="text-neutral-500">
                Total {billingCycle === 'ANNUAL' ? '(cobrado hoje, uma vez)' : 'hoje'}
              </span>
              <span className="text-lg font-extrabold text-neutral-900">
                R$ {amount.toFixed(2).replace('.', ',')}
              </span>
            </div>
            <button
              type="submit"
              disabled={isBusy}
              className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-bold py-3 hover:from-brand-600 hover:to-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              Pagar R$ {amount.toFixed(2).replace('.', ',')}
            </button>
            <p className="flex items-center justify-center gap-1 text-[11px] text-neutral-400 mt-3">
              <ShieldCheck className="h-3 w-3" /> Seus dados são processados de forma segura pela Efí
            </p>
          </div>
        </form>
      )}
    </div>
  )
}
