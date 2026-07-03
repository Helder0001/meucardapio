'use client'

// app/(auth)/register/register-form.tsx

import { useState, useActionState, useEffect } from 'react'
import { registerAction } from '@/actions/auth/register'
import { signIn } from 'next-auth/react'
import { Eye, EyeOff, Loader2, CheckCircle2, Calendar, Zap } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const PLAN_PRICE_MONTHLY = 1.00
const PLAN_PRICE_ANNUAL  = parseFloat((PLAN_PRICE_MONTHLY * 12 * 0.9).toFixed(2))
const ANNUAL_DISCOUNT_PCT = 10

const INITIAL_STATE = {
  error:        undefined as string | undefined,
  success:      false,
  pixInitPoint: undefined as string | undefined,
  email:        undefined as string | undefined,
  password:     undefined as string | undefined,
}

export function RegisterForm() {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(registerAction, INITIAL_STATE)
  const [showPass, setShowPass]         = useState(false)
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const [loggingIn, setLoggingIn]       = useState(false)

  const isAnnual     = billingCycle === 'ANNUAL'
  const monthlyEquiv = isAnnual ? (PLAN_PRICE_ANNUAL / 12).toFixed(2) : null

  // Auto-login após conta criada com sucesso
  useEffect(() => {
    if (state.success && state.email && state.password) {
      setLoggingIn(true)
      signIn('credentials', {
        email:    state.email,
        password: state.password,
        redirect: false,
      }).then((result) => {
        if (result?.ok) {
          // Se tem link do MP, redireciona para lá; senão vai para o dashboard
          if (state.pixInitPoint) {
            window.location.href = state.pixInitPoint
          } else {
            router.push('/dashboard')
          }
        } else {
          // Login automático falhou — manda para login manual
          router.push('/login?cadastro=ok')
        }
      }).catch(() => {
        router.push('/login?cadastro=ok')
      })
    }
  }, [state.success, state.email, state.password])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('billingCycle', billingCycle)
    formAction(fd)
  }

  // Tela de loading enquanto faz login automático
  if (loggingIn) {
    return (
      <div className="text-center space-y-4 py-8">
        <Loader2 className="w-10 h-10 animate-spin text-brand-500 mx-auto" />
        <p className="text-gray-600 font-medium">Entrando na sua conta...</p>
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
          <button
            type="button"
            onClick={() => setBillingCycle('MONTHLY')}
            className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all text-left ${
              billingCycle === 'MONTHLY'
                ? 'border-brand-500 bg-brand-50 text-brand-700'
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
                ? 'border-brand-500 bg-brand-50 text-brand-700'
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

      {/* Dados do negócio */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Seu negócio</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do restaurante *</label>
          <input name="tenantName" type="text" required placeholder="Ex: Pizzaria do João"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL do cardápio *</label>
          <div className="flex items-center">
            <span className="px-3 py-2.5 bg-gray-50 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">menu/</span>
            <input name="slug" type="text" required placeholder="pizzaria-joao"
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-r-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
      </div>

      {/* Dados pessoais */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Seus dados</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
          <input name="name" type="text" required placeholder="João Silva"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
          <input name="email" type="email" required placeholder="joao@email.com"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
          <div className="relative">
            <input name="password" type={showPass ? 'text' : 'password'} required minLength={8} placeholder="Mínimo 8 caracteres"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 pr-10" />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Info trial */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
        <strong>7 dias grátis</strong> — nenhuma cobrança durante o trial. Após criar a conta, você será redirecionado para o Mercado Pago para ativar a assinatura com cartão de crédito.
      </div>

      <input type="hidden" name="billingCycle" value={billingCycle} />

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando conta...</>
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
