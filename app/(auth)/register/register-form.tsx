'use client'

// app/(auth)/register/register-form.tsx

import { useState, useActionState, useEffect } from 'react'
import { registerAction } from '@/actions/auth/register'
import {
  Eye, EyeOff, Loader2, CreditCard, Lock, CheckCircle2,
  QrCode, Calendar, Zap,
} from 'lucide-react'
import Link from 'next/link'

// ── Preços (espelhar /api/mp/preapproval/route.ts) ────────────────────────────
const PLAN_PRICE_MONTHLY = 1.00
const PLAN_PRICE_ANNUAL  = parseFloat((PLAN_PRICE_MONTHLY * 12 * 0.9).toFixed(2))
const ANNUAL_DISCOUNT_PCT = 10

const INITIAL_STATE = { error: undefined as string | undefined, success: false, pixInitPoint: undefined as string | undefined }

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, INITIAL_STATE)
  const [showPass, setShowPass]   = useState(false)

  // Ciclo de cobrança
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')

  // Método de pagamento
  const [payMethod, setPayMethod] = useState<'CARD' | 'PIX'>('CARD')

  // Campos do cartão
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName]     = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv]       = useState('')
  const [cardCpf, setCardCpf]       = useState('')
  const [cardToken, setCardToken]   = useState('')
  const [cardError, setCardError]   = useState('')
  const [tokenizing, setTokenizing] = useState(false)
  const [sdkReady, setSdkReady]     = useState(false)

  const isAnnual      = billingCycle === 'ANNUAL'
  const currentPrice  = isAnnual ? PLAN_PRICE_ANNUAL : PLAN_PRICE_MONTHLY
  const monthlyEquiv  = isAnnual ? (PLAN_PRICE_ANNUAL / 12).toFixed(2) : null

  // Load Mercado Pago SDK
  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://sdk.mercadopago.com/js/v2"]'
    )
    if (existing) {
      if ((window as any).MercadoPago) setSdkReady(true)
      else existing.addEventListener('load', () => setSdkReady(true))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.async = true
    script.onload = () => setSdkReady(true)
    script.onerror = () => setCardError('Não foi possível carregar o Mercado Pago. Verifique sua conexão.')
    document.head.appendChild(script)
  }, [])

  const fmt = {
    card:   (v: string) => v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim(),
    expiry: (v: string) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d },
    cpf:    (v: string) => { const d = v.replace(/\D/g, '').slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2') },
  }

  const tokenizeCard = async (): Promise<string | null> => {
    setCardError('')
    const cpfDigits = cardCpf.replace(/\D/g, '')
    if (cpfDigits.length !== 11)            { setCardError('CPF do titular é obrigatório.'); return null }
    if (cardNumber.replace(/\s/g, '').length < 13) { setCardError('Número do cartão inválido.'); return null }
    if (!cardName.trim())                   { setCardError('Nome no cartão é obrigatório.'); return null }
    if (!cardExpiry.includes('/') || cardExpiry.length < 5) { setCardError('Data de validade inválida.'); return null }
    if (!cardCvv || cardCvv.length < 3)    { setCardError('CVV inválido.'); return null }

    setTokenizing(true)
    try {
      if (!sdkReady) throw new Error('O Mercado Pago ainda está carregando. Aguarde.')
      const MercadoPago = (window as any).MercadoPago
      if (!MercadoPago) throw new Error('SDK do Mercado Pago não carregou. Recarregue a página.')
      const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY
      if (!publicKey) throw new Error('Chave pública do Mercado Pago não configurada.')
      const mp = new MercadoPago(publicKey, { locale: 'pt-BR' })
      const [expMonth, expYear] = cardExpiry.split('/')
      const result = await mp.createCardToken({
        cardNumber:          cardNumber.replace(/\s/g, ''),
        cardholderName:      cardName.trim(),
        cardExpirationMonth: expMonth,
        cardExpirationYear:  `20${expYear}`,
        securityCode:        cardCvv,
        identificationType:  'CPF',
        identificationNumber: cpfDigits,
      })
      if (!result?.id) {
        const cause = result?.cause?.[0]
        throw new Error(cause?.description ?? cause?.code ?? 'Cartão inválido. Verifique os dados.')
      }
      setCardToken(result.id)
      return result.id
    } catch (err: any) {
      setCardError(err.message ?? 'Cartão inválido.')
      return null
    } finally {
      setTokenizing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('billingCycle', billingCycle)

    if (payMethod === 'CARD') {
      const token = await tokenizeCard()
      if (!token) return
      fd.set('cardToken', token)
      fd.set('cardName', cardName.trim())
      fd.set('cardCpf', cardCpf.replace(/\D/g, ''))
    } else {
      // PIX: sem token de cartão
      fd.delete('cardToken')
    }

    formAction(fd)
  }

  // ── Sucesso: PIX mostra link de pagamento ─────────────────────────────────
  if (state.success) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Conta criada com sucesso!</h2>

        {state.pixInitPoint ? (
          <>
            <p className="text-gray-500 text-sm">
              Seus 7 dias de teste começaram. Para ativar a assinatura via PIX após o trial,
              você receberá um link de pagamento por e-mail.
            </p>
            <a
              href={state.pixInitPoint}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-2 py-3 px-6 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-colors text-center"
            >
              Pagar via PIX agora (opcional)
            </a>
          </>
        ) : (
          <p className="text-gray-500 text-sm">
            Seus 7 dias de teste começaram. Nenhuma cobrança será feita antes do período terminar.
          </p>
        )}

        <Link href="/login" className="block mt-4 py-3 px-6 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-colors text-center">
          Entrar no painel
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {state.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {state.error}
        </div>
      )}

      {/* ── Plano único ─────────────────────────────────────────────────── */}
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-bold text-orange-700 uppercase tracking-wide">Plano PRO — Acesso completo</h3>
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

      {/* ── Ciclo de cobrança ────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Periodicidade
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setBillingCycle('MONTHLY')}
            className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all text-left ${
              billingCycle === 'MONTHLY'
                ? 'border-orange-500 bg-orange-50 text-orange-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <div className="font-bold">Mensal</div>
            <div className="text-lg font-extrabold mt-0.5">
              R$ {PLAN_PRICE_MONTHLY.toFixed(2).replace('.', ',')}
              <span className="text-xs font-normal text-gray-500">/mês</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle('ANNUAL')}
            className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all text-left relative ${
              billingCycle === 'ANNUAL'
                ? 'border-orange-500 bg-orange-50 text-orange-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
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

      {/* ── Dados do negócio ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Seu negócio</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do restaurante *</label>
          <input name="tenantName" type="text" required placeholder="Ex: Pizzaria do João"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL do cardápio *</label>
          <div className="flex items-center">
            <span className="px-3 py-2.5 bg-gray-50 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">menu/</span>
            <input name="slug" type="text" required placeholder="pizzaria-joao"
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-r-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>
      </div>

      {/* ── Dados pessoais ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Seus dados</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
          <input name="name" type="text" required placeholder="João Silva"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
          <input name="email" type="email" required placeholder="joao@email.com"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
          <div className="relative">
            <input name="password" type={showPass ? 'text' : 'password'} required minLength={8} placeholder="Mínimo 8 caracteres"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 pr-10" />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Método de pagamento ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Forma de pagamento</h3>

        {/* Toggle cartão / PIX */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPayMethod('CARD')}
            className={`py-2.5 px-4 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              payMethod === 'CARD'
                ? 'border-orange-500 bg-orange-50 text-orange-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <CreditCard className="h-4 w-4" /> Cartão
          </button>
          <button
            type="button"
            onClick={() => setPayMethod('PIX')}
            className={`py-2.5 px-4 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              payMethod === 'PIX'
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <QrCode className="h-4 w-4" /> PIX recorrente
          </button>
        </div>

        {/* Info do trial */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
          <strong>7 dias grátis</strong> — nenhuma cobrança durante o trial.
          {payMethod === 'CARD'
            ? ` Após, R$\u00a0${currentPrice.toFixed(2).replace('.', ',')}/${isAnnual ? 'ano' : 'mês'} debitado automaticamente.`
            : ' Após o trial, você receberá o QR Code PIX por e-mail para renovar.'}
        </div>

        {/* ── Campos do cartão ──────────────────────────────────────────── */}
        {payMethod === 'CARD' && (
          <div className="space-y-3">
            {cardError && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{cardError}</p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Número do cartão *</label>
              <input type="text" inputMode="numeric" value={cardNumber}
                onChange={(e) => setCardNumber(fmt.card(e.target.value))}
                placeholder="0000 0000 0000 0000" maxLength={19}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome no cartão *</label>
              <input type="text" value={cardName} onChange={(e) => setCardName(e.target.value.toUpperCase())}
                placeholder="JOÃO SILVA"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF do titular *</label>
              <input type="text" inputMode="numeric" value={cardCpf}
                onChange={(e) => setCardCpf(fmt.cpf(e.target.value))}
                placeholder="000.000.000-00" maxLength={14}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Validade *</label>
                <input type="text" inputMode="numeric" value={cardExpiry}
                  onChange={(e) => setCardExpiry(fmt.expiry(e.target.value))}
                  placeholder="MM/AA" maxLength={5}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CVV *</label>
                <input type="text" inputMode="numeric" value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="000" maxLength={4}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Lock className="h-3 w-3" />
              Dados protegidos pelo Mercado Pago. Nunca passam pelo nosso servidor.
            </div>
          </div>
        )}

        {/* ── Info PIX ─────────────────────────────────────────────────── */}
        {payMethod === 'PIX' && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-800 space-y-1">
            <p><strong>Como funciona o PIX recorrente:</strong></p>
            <p>1. Crie sua conta e aproveite os 7 dias grátis.</p>
            <p>2. Ao final do trial, você receberá um QR Code PIX por e-mail.</p>
            <p>3. Pague para continuar com acesso completo.</p>
          </div>
        )}
      </div>

      {/* Hidden fields */}
      <input type="hidden" name="cardToken" value={cardToken} />
      <input type="hidden" name="billingCycle" value={billingCycle} />

      <button
        type="submit"
        disabled={isPending || tokenizing || (payMethod === 'CARD' && !sdkReady)}
        className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {(isPending || tokenizing) ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> {tokenizing ? 'Validando cartão...' : 'Criando conta...'}</>
        ) : payMethod === 'CARD' && !sdkReady ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</>
        ) : (
          `Criar conta — 7 dias grátis`
        )}
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
