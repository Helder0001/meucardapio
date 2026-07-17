'use client'

// app/(auth)/register/register-form.tsx
//
// MUDANÇA DE PRODUTO (13/07): cartão passou a ser OBRIGATÓRIO no cadastro
// (antes só era pedido quando o trial vencia, em /assinatura). Duas opções
// pra pessoa escolher:
// - "7 dias grátis": captura o cartão agora, mas só cobra daqui a 7 dias
//   (trial_days na Efí — ela mesma agenda e cobra automaticamente se não
//   cancelar, sem precisar de cron nosso).
// - "Começar agora": cobra o cartão na hora, libera acesso completo assim
//   que o pagamento for confirmado (sem esperar 7 dias).
//
// A tokenização do cartão é feita com a mesma lib usada em
// app/assinatura/subscription-card-form.tsx (payment-token-efi,
// vendorizada em /vendor) — client component típico não dava conta porque
// gerar o payment_token é um passo assíncrono no navegador que precisa
// rodar ANTES de mandar o form pro servidor.

import { useState, useEffect, useRef } from 'react'
import { registerAction, type RegisterState } from '@/actions/auth/register'
import { signIn } from 'next-auth/react'
import { Eye, EyeOff, Loader2, Calendar, Zap, AlertCircle, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCpf, isValidCpf, onlyDigits } from '@/lib/utils/cpf'

declare global {
  interface Window {
    EfiPay?: any
  }
}

const PLAN_PRICE_MONTHLY = 3.00
const PLAN_PRICE_ANNUAL  = parseFloat((PLAN_PRICE_MONTHLY * 12 * 0.9).toFixed(2))
const ANNUAL_DISCOUNT_PCT = 10

const EFI_SCRIPT_SRC = '/vendor/payment-token-efi.js'
const POLL_INTERVAL_MS = 3_000
const POLL_MAX_ATTEMPTS = 40 // ~2 minutos

function formatCardNumber(value: string): string {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

function formatPhoneInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ''
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

const CURRENT_YEAR = new Date().getFullYear()
const EXPIRATION_YEARS = Array.from({ length: 13 }, (_, i) => String(CURRENT_YEAR + i))
const EXPIRATION_MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

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

interface RegisterFormProps {
  efiAccountIdentifier: string
  efiSandbox: boolean
}

type FormStage = 'form' | 'tokenizing' | 'creating-account' | 'confirming-payment' | 'logging-in'

export function RegisterForm({ efiAccountIdentifier, efiSandbox }: RegisterFormProps) {
  const router = useRouter()
  const [stage, setStage] = useState<FormStage>('form')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sdkReady, setSdkReady] = useState(false)

  const [showPass, setShowPass] = useState(false)
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const [startImmediately, setStartImmediately] = useState(false)

  // Dados do negócio / conta
  const [tenantName, setTenantName] = useState('')
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Dados do cartão
  const [cardNumber, setCardNumber] = useState('')
  const [expirationMonth, setExpirationMonth] = useState('')
  const [expirationYear, setExpirationYear] = useState('')
  const [cvv, setCvv] = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [payerPhone, setPayerPhone] = useState('')
  const [payerCpf, setPayerCpf] = useState('')

  const cancelledRef = useRef(false)
  const isAnnual = billingCycle === 'ANNUAL'
  const monthlyEquiv = isAnnual ? (PLAN_PRICE_ANNUAL / 12).toFixed(2) : null
  const amount = isAnnual ? PLAN_PRICE_ANNUAL : PLAN_PRICE_MONTHLY

  useEffect(() => {
    cancelledRef.current = false
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
      if (!cancelledRef.current && window.EfiPay?.CreditCard) setSdkReady(true)
    }
    loadSdk().catch((err) => {
      console.error('[register-form] erro ao carregar SDK da Efí:', err)
    })
    return () => { cancelledRef.current = true }
  }, [])

  async function doAutoLoginAndRedirect(waitForPaymentConfirmation: boolean) {
    setStage('logging-in')
    const result = await signIn('credentials', { email, password, redirect: false })
    if (!result?.ok) {
      router.push('/login?cadastro=ok')
      return
    }

    if (!waitForPaymentConfirmation) {
      router.push('/dashboard')
      router.refresh()
      return
    }

    // Pagou na hora: aguarda o webhook confirmar antes de liberar, mesma
    // cautela usada em app/assinatura/subscription-card-form.tsx.
    setStage('confirming-payment')
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      if (cancelledRef.current) return
      if (await checkSubscriptionActive()) {
        router.push('/dashboard')
        router.refresh()
        return
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
    // Demorou mais que o esperado — manda pro dashboard mesmo assim; se
    // ainda não confirmou, o paywall do layout cuida de bloquear e a
    // pessoa só vê uma tela de "aguardando confirmação" em vez de travar
    // aqui pra sempre.
    router.push('/dashboard')
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage(null)

    const cardDigits = onlyDigits(cardNumber)
    if (cardDigits.length < 13) return setErrorMessage('Número do cartão inválido.')
    if (!expirationMonth || !expirationYear) return setErrorMessage('Informe a validade do cartão.')
    if (!cvv || cvv.length < 3) return setErrorMessage('CVV inválido.')
    if (!cardholderName.trim()) return setErrorMessage('Informe o nome impresso no cartão.')
    const phoneDigits = onlyDigits(payerPhone)
    if (phoneDigits.length < 10) return setErrorMessage('Informe um telefone válido, com DDD.')
    if (!isValidCpf(payerCpf)) return setErrorMessage('CPF inválido.')

    if (!sdkReady || !window.EfiPay?.CreditCard) {
      return setErrorMessage(
        'O script de pagamento não carregou corretamente. Se você usa bloqueador de anúncios ou VPN com filtro de conteúdo, desative e recarregue a página.'
      )
    }

    setStage('tokenizing')

    let paymentToken: string
    try {
      const brand = await window.EfiPay.CreditCard.setCardNumber(cardDigits).verifyCardBrand()
      if (!brand || brand === 'undefined' || brand === 'unsupported') {
        setStage('form')
        return setErrorMessage('Bandeira do cartão não identificada ou não suportada.')
      }
      const tokenResult = await window.EfiPay.CreditCard
        .setAccount(efiAccountIdentifier)
        .setEnvironment(efiSandbox ? 'sandbox' : 'production')
        .setCreditCardData({
          brand,
          number: cardDigits,
          cvv,
          expirationMonth,
          expirationYear,
          reuse: true, // recorrência precisa reutilizar o payment_token nas cobranças seguintes
        })
        .getPaymentToken()
      paymentToken = tokenResult.payment_token
    } catch (err: any) {
      setStage('form')
      const detail = err?.error_description || err?.error || err?.message
      setErrorMessage(detail ? `Não foi possível processar o cartão: ${detail}` : 'Não foi possível processar o cartão. Confira os dados e tente novamente.')
      return
    }

    setStage('creating-account')

    const fd = new FormData()
    fd.set('tenantName', tenantName)
    fd.set('slug', slug)
    fd.set('name', name)
    fd.set('email', email)
    fd.set('password', password)
    fd.set('billingCycle', billingCycle)
    fd.set('cardToken', paymentToken)
    fd.set('cardLast4', cardDigits.slice(-4))
    fd.set('cardholderName', cardholderName.trim())
    fd.set('payerCpf', payerCpf)
    fd.set('payerPhone', phoneDigits)
    fd.set('startImmediately', startImmediately ? 'true' : 'false')

    const result: RegisterState = await registerAction({}, fd)

    if (result.error) {
      setStage('form')
      setErrorMessage(result.error)
      return
    }

    if (result.success && result.email && result.password) {
      await doAutoLoginAndRedirect(Boolean(result.waitingPaymentConfirmation))
    }
  }

  const isBusy = stage !== 'form'
  const inputClass =
    'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400'

  if (stage === 'logging-in' || stage === 'confirming-payment') {
    return (
      <div className="text-center space-y-4 py-8">
        <Loader2 className="w-10 h-10 animate-spin text-brand-500 mx-auto" />
        <p className="text-gray-600 font-medium">
          {stage === 'confirming-payment' ? 'Confirmando pagamento... isso pode levar alguns segundos.' : 'Entrando na sua conta...'}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errorMessage && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Plano único */}
      <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-bold text-brand-700 uppercase tracking-wide">Plano PRO — Acesso completo</h3>
        </div>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>✓ Cardápio digital + QR Code</li>
          <li>✓ Pedidos em tempo real (kanban)</li>
          <li>✓ Pagamentos PIX + cartão</li>
          <li>✓ WhatsApp + notificações</li>
          <li>✓ Usuários ilimitados</li>
          <li>✓ Relatórios e delivery</li>
        </ul>
      </div>

      {/* Ciclo de cobrança */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Periodicidade
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={isBusy} onClick={() => setBillingCycle('MONTHLY')}
            className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all text-left disabled:opacity-60 ${
              billingCycle === 'MONTHLY' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            <div className="font-bold">Mensal</div>
            <div className="text-lg font-extrabold mt-0.5">
              R$ {PLAN_PRICE_MONTHLY.toFixed(2).replace('.', ',')}
              <span className="text-xs font-normal text-gray-500">/mês</span>
            </div>
          </button>

          <button type="button" disabled={isBusy} onClick={() => setBillingCycle('ANNUAL')}
            className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all text-left relative disabled:opacity-60 ${
              billingCycle === 'ANNUAL' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            <span className="absolute -top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              -{ANNUAL_DISCOUNT_PCT}%
            </span>
            <div className="font-bold">Anual</div>
            <div className="text-lg font-extrabold mt-0.5">
              R$ {monthlyEquiv?.replace('.', ',')}
              <span className="text-xs font-normal text-gray-500">/mês</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              R$ {PLAN_PRICE_ANNUAL.toFixed(2).replace('.', ',')} cobrado anualmente
            </div>
          </button>
        </div>
      </div>

      {/* Dados do negócio */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Seu negócio</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do restaurante *</label>
          <input type="text" required placeholder="Ex: Pizzaria do João" disabled={isBusy}
            value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL do cardápio *</label>
          <div className="flex items-center">
            <span className="px-3 py-2.5 bg-gray-50 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">menu/</span>
            <input type="text" required placeholder="pizzaria-joao" disabled={isBusy}
              value={slug} onChange={(e) => setSlug(e.target.value)}
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-r-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400" />
          </div>
        </div>
      </div>

      {/* Dados pessoais */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Seus dados</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
          <input type="text" required placeholder="João Silva" disabled={isBusy}
            value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
          <input type="email" required placeholder="joao@email.com" disabled={isBusy}
            value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} required minLength={8} placeholder="Mínimo 8 caracteres" disabled={isBusy}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-10`} />
            <button type="button" onClick={() => setShowPass(!showPass)} disabled={isBusy}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Forma de início */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Como quer começar?</h3>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={isBusy} onClick={() => setStartImmediately(false)}
            className={`py-3 px-3 rounded-xl border-2 text-sm font-medium transition-all text-left disabled:opacity-60 ${
              !startImmediately ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            <div className="font-bold">7 dias grátis</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Cobra só depois do trial</div>
          </button>
          <button type="button" disabled={isBusy} onClick={() => setStartImmediately(true)}
            className={`py-3 px-3 rounded-xl border-2 text-sm font-medium transition-all text-left disabled:opacity-60 ${
              startImmediately ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            <div className="font-bold">Começar agora</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Cobra na hora, sem esperar</div>
          </button>
        </div>
      </div>

      {/* Cartão */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Cartão de crédito *
        </h3>
        <p className="text-xs text-gray-500 -mt-2">
          {startImmediately
            ? 'Seu cartão será cobrado imediatamente.'
            : 'Seu cartão só será cobrado após os 7 dias grátis — cancele quando quiser antes disso.'}
        </p>

        <div>
          <input type="text" required placeholder="Número do cartão" disabled={isBusy} inputMode="numeric" maxLength={23}
            value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} className={inputClass} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select required disabled={isBusy} value={expirationMonth} onChange={(e) => setExpirationMonth(e.target.value)} className={inputClass}>
            <option value="">MM</option>
            {EXPIRATION_MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select required disabled={isBusy} value={expirationYear} onChange={(e) => setExpirationYear(e.target.value)} className={inputClass}>
            <option value="">AAAA</option>
            {EXPIRATION_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <input type="text" required placeholder="CVV" disabled={isBusy} inputMode="numeric" maxLength={4}
            value={cvv} onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))} className={inputClass} />
        </div>
        <div>
          <input type="text" required placeholder="Nome impresso no cartão" disabled={isBusy}
            value={cardholderName} onChange={(e) => setCardholderName(e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="text" required placeholder="CPF do titular" disabled={isBusy} inputMode="numeric" maxLength={14}
            value={payerCpf} onChange={(e) => setPayerCpf(formatCpf(e.target.value))} className={inputClass} />
          <input type="text" required placeholder="(11) 99999-9999" disabled={isBusy} inputMode="numeric" maxLength={15}
            value={payerPhone} onChange={(e) => setPayerPhone(formatPhoneInput(e.target.value))} className={inputClass} />
        </div>
      </div>

      <button
        type="submit"
        disabled={isBusy || !sdkReady}
        className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {isBusy
          ? <><Loader2 className="h-4 w-4 animate-spin" /> {
              stage === 'tokenizing' ? 'Processando cartão...' : 'Criando conta...'
            }</>
          : !sdkReady
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</>
            : startImmediately
              ? `Criar conta e pagar R$ ${amount.toFixed(2).replace('.', ',')}`
              : 'Criar conta — 7 dias grátis'
        }
      </button>

      <p className="text-center text-xs text-gray-400">
        Ao criar sua conta, você concorda com os{' '}
        <Link href="/termos" className="underline hover:text-gray-600">Termos de Uso</Link>
        {' e '}
        <Link href="/privacidade" className="underline hover:text-gray-600">Política de Privacidade</Link>.
      </p>
    </form>
  )
}
