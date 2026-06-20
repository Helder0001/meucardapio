'use client'

// app/(auth)/register/register-form.tsx
// Cadastro com cartão obrigatório (trial de 7 dias, cobrança automática após)

import { useState, useActionState, useEffect } from 'react'
import { registerAction } from '@/actions/auth/register'
import { Eye, EyeOff, Loader2, CreditCard, Lock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

const INITIAL_STATE = { error: undefined as string | undefined, success: false }

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, INITIAL_STATE)
  const [showPass, setShowPass] = useState(false)

  // Card fields (tokenized client-side via MP SDK)
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName]     = useState('')
  const [cardExpiry, setCardExpiry] = useState('')  // MM/AA
  const [cardCvv, setCardCvv]       = useState('')
  const [cardCpf, setCardCpf]       = useState('')
  const [cardToken, setCardToken]   = useState('')
  const [cardError, setCardError]   = useState('')
  const [tokenizing, setTokenizing] = useState(false)

  // Load Mercado Pago SDK
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.async = true
    document.head.appendChild(script)
    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script)
      }
    }
  }, [])

  const formatCardNumber = (v: string) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()

  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4)
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
  }

  const formatCpf = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11)
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  const tokenizeCard = async (): Promise<string | null> => {
    setCardError('')

    const cpfDigits = cardCpf.replace(/\D/g, '')
    if (cpfDigits.length !== 11) {
      setCardError('CPF do titular do cartão é obrigatório.')
      return null
    }

    if (!cardNumber.replace(/\s/g, '') || cardNumber.replace(/\s/g, '').length < 13) {
      setCardError('Número do cartão inválido.')
      return null
    }

    if (!cardName.trim()) {
      setCardError('Nome no cartão é obrigatório.')
      return null
    }

    if (!cardExpiry.includes('/') || cardExpiry.length < 5) {
      setCardError('Data de validade inválida.')
      return null
    }

    if (!cardCvv || cardCvv.length < 3) {
      setCardError('CVV inválido.')
      return null
    }

    setTokenizing(true)
    try {
      console.log('[register] iniciando tokenização...')

      // FIX: aguardar o SDK carregar caso ainda não esteja disponível
      const MercadoPago = (window as any).MercadoPago
      if (!MercadoPago) throw new Error('SDK do Mercado Pago não carregou. Recarregue a página.')

      const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY
      console.log('[register] MP public key presente:', !!publicKey)
      if (!publicKey) throw new Error('Chave pública do Mercado Pago não configurada.')

      // FIX: instanciar corretamente com `new MercadoPago(key, options)`
      // e chamar createCardToken() diretamente na instância criada
      const mp = new MercadoPago(publicKey, { locale: 'pt-BR' })

      const [expMonth, expYear] = cardExpiry.split('/')

      console.log('[register] chamando createCardToken...')
      const result = await mp.createCardToken({
        cardNumber: cardNumber.replace(/\s/g, ''),
        cardholderName: cardName.trim(),
        cardExpirationMonth: expMonth,
        cardExpirationYear: `20${expYear}`,
        securityCode: cardCvv,
        identificationType: 'CPF',
        identificationNumber: cpfDigits,
      })

      console.log('[register] resultado MP:', JSON.stringify(result))

      // FIX: o SDK v2 retorna erros em result.cause[], não em result.error
      if (!result?.id) {
        const cause = result?.cause?.[0]
        const msg = cause?.description ?? cause?.code ?? 'Cartão inválido. Verifique os dados.'
        throw new Error(msg)
      }

      setCardToken(result.id)
      return result.id
    } catch (err: any) {
      console.error('[register] erro tokenização:', err)
      setCardError(err.message ?? 'Cartão inválido. Verifique os dados.')
      return null
    } finally {
      setTokenizing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    console.log('[register] form submetido')

    // IMPORTANTE: capturar FormData ANTES do await, pois após o await
    // o e.currentTarget perde a referência ao HTMLFormElement
    const fd = new FormData(e.currentTarget)

    const token = await tokenizeCard()
    console.log('[register] token obtido:', !!token)
    if (!token) return

    console.log('[register] chamando formAction...')
    fd.set('cardToken', token)
    // Passar nome e CPF para o server action usar no payload da preapproval
    fd.set('cardName', cardName.trim())
    fd.set('cardCpf', cardCpf.replace(/\D/g, ''))
    formAction(fd)
  }

  if (state.success) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Conta criada com sucesso!</h2>
        <p className="text-gray-500 text-sm">
          Seus 7 dias de teste começaram. Nenhuma cobrança será feita antes do período terminar.
        </p>
        <Link href="/login" className="block mt-4 py-3 px-6 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-colors text-center">
          Entrar no painel
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {state.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {state.error}
        </div>
      )}

      {/* Dados do negócio */}
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

      {/* Dados pessoais */}
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

      {/* Cartão de crédito */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Cartão de crédito</h3>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-xs text-orange-700">
          <strong>7 dias grátis</strong> — nenhuma cobrança durante o trial. Após, R$49/mês (Starter).
          Cancele quando quiser antes do trial acabar.
        </div>

        {cardError && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{cardError}</p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Número do cartão *</label>
          <input type="text" inputMode="numeric" value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
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
            onChange={(e) => setCardCpf(formatCpf(e.target.value))}
            placeholder="000.000.000-00" maxLength={14}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Validade *</label>
            <input type="text" inputMode="numeric" value={cardExpiry}
              onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
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

      {/* Hidden field for card token */}
      <input type="hidden" name="cardToken" value={cardToken} />

      <button type="submit" disabled={isPending || tokenizing}
        className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
        {(isPending || tokenizing) ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> {tokenizing ? 'Validando cartão...' : 'Criando conta...'}</>
        ) : (
          'Criar conta — 7 dias grátis'
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
