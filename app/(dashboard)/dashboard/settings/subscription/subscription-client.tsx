'use client'

// app/(dashboard)/dashboard/settings/subscription/subscription-client.tsx

import { useState, useTransition, useEffect, useRef } from 'react'
import { Loader2, XCircle, CreditCard, Receipt, AlertCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { cancelSubscriptionAction } from '@/actions/billing/cancel-subscription'
import { updateCardAction } from '@/actions/billing/update-card'
import { onlyDigits } from '@/lib/utils/cpf'

declare global {
  interface Window {
    EfiPay?: any
  }
}

const BILLING_CYCLE_LABELS: Record<string, string> = {
  MONTHLY: 'Mensal',
  ANNUAL: 'Anual',
}

const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter',
  PRO: 'PRO',
  PREMIUM: 'Premium',
}

const EFI_SCRIPT_SRC = '/vendor/payment-token-efi.js'

function formatCardNumber(value: string): string {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

const CURRENT_YEAR = new Date().getFullYear()
const EXPIRATION_YEARS = Array.from({ length: 13 }, (_, i) => String(CURRENT_YEAR + i))
const EXPIRATION_MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

interface SubscriptionInfo {
  status: string
  plan: string
  billingCycle: string
  amount: number
  cardLast4: string | null
  currentPeriodEnd: string
  cancelledAt: string | null
}

interface PaymentHistoryItem {
  id: string
  plan: string
  billingCycle: string
  amount: number
  cardLast4: string | null
  paidAt: string
}

interface SubscriptionClientProps {
  subscription: SubscriptionInfo | null
  payments: PaymentHistoryItem[]
  efiAccountIdentifier: string
  efiSandbox: boolean
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function SubscriptionClient({ subscription, payments, efiAccountIdentifier, efiSandbox }: SubscriptionClientProps) {
  const [isCancelling, startCancel] = useTransition()
  const [sub, setSub] = useState(subscription)
  const [showUpdateCard, setShowUpdateCard] = useState(false)

  const handleCancelSubscription = () => {
    if (!sub) return
    const accessUntilLabel = new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')
    const confirmed = window.confirm(
      `Cancelar sua assinatura do Plano ${PLAN_LABELS[sub.plan] ?? sub.plan}?\n\nSeu acesso continua normal até ${accessUntilLabel} (fim do período já pago). Depois disso, o dashboard fica bloqueado e nenhuma nova cobrança será feita no cartão.`
    )
    if (!confirmed) return

    startCancel(async () => {
      const result = await cancelSubscriptionAction()
      if (result.error) {
        toast.error(result.error)
        return
      }
      setSub((prev) => (prev ? { ...prev, cancelledAt: new Date().toISOString() } : prev))
      toast.success(`Assinatura cancelada. Acesso garantido até ${accessUntilLabel}.`)
    })
  }

  if (!sub) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 text-sm text-muted-foreground">
        Nenhuma assinatura encontrada pra esse estabelecimento.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Plano atual */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-foreground">Plano atual</h2>

        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
          <div>
            <span className="font-medium text-foreground block">Plano</span>
            Meu Cardápio {PLAN_LABELS[sub.plan] ?? sub.plan} — {BILLING_CYCLE_LABELS[sub.billingCycle] ?? sub.billingCycle}
          </div>
          <div>
            <span className="font-medium text-foreground block">Valor</span>
            {formatCurrency(sub.amount)}
            {sub.billingCycle === 'ANNUAL' ? '/ano' : '/mês'}
          </div>
          <div>
            <span className="font-medium text-foreground block">
              {sub.cancelledAt ? 'Acesso garantido até' : 'Próxima cobrança'}
            </span>
            {new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')}
          </div>
          {sub.cardLast4 && (
            <div>
              <span className="font-medium text-foreground block">Cartão</span>
              <span className="inline-flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> •••• {sub.cardLast4}
              </span>
            </div>
          )}
        </div>

        {sub.cancelledAt ? (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2.5">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Cancelamento solicitado. Você continua com acesso normal até{' '}
              {new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')} — depois disso o
              acesso é bloqueado e não haverá nova cobrança no cartão.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowUpdateCard(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-muted text-foreground text-sm font-medium rounded-lg hover:bg-muted/70 transition-colors"
            >
              <CreditCard className="h-4 w-4" />
              Trocar cartão
            </button>
            <button
              onClick={handleCancelSubscription}
              disabled={isCancelling}
              className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive text-sm font-medium rounded-lg hover:bg-destructive/20 disabled:opacity-60 transition-colors"
            >
              {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Cancelar assinatura
            </button>
          </div>
        )}
      </div>

      {/* Extrato de pagamentos */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Receipt className="h-4 w-4" /> Histórico de pagamentos
        </h2>

        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum pagamento confirmado ainda. Assim que a primeira cobrança for paga, ela aparece aqui.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Data</th>
                  <th className="px-5 py-2 font-medium">Plano</th>
                  <th className="px-5 py-2 font-medium">Cartão</th>
                  <th className="px-5 py-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 text-foreground">
                      {new Date(p.paidAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {PLAN_LABELS[p.plan] ?? p.plan} · {BILLING_CYCLE_LABELS[p.billingCycle] ?? p.billingCycle}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {p.cardLast4 ? `•••• ${p.cardLast4}` : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium text-foreground">
                      {formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showUpdateCard && (
        <UpdateCardModal
          efiAccountIdentifier={efiAccountIdentifier}
          efiSandbox={efiSandbox}
          onClose={() => setShowUpdateCard(false)}
          onSuccess={(last4) => {
            setSub((prev) => (prev ? { ...prev, cardLast4: last4 } : prev))
            setShowUpdateCard(false)
            toast.success('Cartão atualizado! Vale a partir da próxima cobrança.')
          }}
        />
      )}
    </div>
  )
}

function UpdateCardModal({
  efiAccountIdentifier,
  efiSandbox,
  onClose,
  onSuccess,
}: {
  efiAccountIdentifier: string
  efiSandbox: boolean
  onClose: () => void
  onSuccess: (last4: string) => void
}) {
  const [sdkReady, setSdkReady] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [cardNumber, setCardNumber] = useState('')
  const [expirationMonth, setExpirationMonth] = useState('')
  const [expirationYear, setExpirationYear] = useState('')
  const [cvv, setCvv] = useState('')

  const cancelledRef = useRef(false)

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
    loadSdk().catch(() => {
      if (!cancelledRef.current) {
        setErrorMessage('Não foi possível carregar o formulário de pagamento. Recarregue a página.')
      }
    })
    return () => { cancelledRef.current = true }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    const digits = onlyDigits(cardNumber)
    if (digits.length < 13) return setErrorMessage('Número do cartão inválido.')
    if (!expirationMonth || !expirationYear) return setErrorMessage('Informe a validade do cartão.')
    if (!cvv || cvv.length < 3) return setErrorMessage('CVV inválido.')

    if (!sdkReady || !window.EfiPay?.CreditCard) {
      return setErrorMessage(
        'O script de pagamento não carregou corretamente. Se você usa bloqueador de anúncios ou VPN com filtro de conteúdo, desative e recarregue a página.'
      )
    }

    setIsSubmitting(true)
    try {
      const brand = await window.EfiPay.CreditCard.setCardNumber(digits).verifyCardBrand()
      if (!brand || brand === 'undefined' || brand === 'unsupported') {
        setIsSubmitting(false)
        return setErrorMessage('Bandeira do cartão não identificada ou não suportada.')
      }

      const tokenResult = await window.EfiPay.CreditCard
        .setAccount(efiAccountIdentifier)
        .setEnvironment(efiSandbox ? 'sandbox' : 'production')
        .setCreditCardData({
          brand,
          number: digits,
          cvv,
          expirationMonth,
          expirationYear,
          reuse: true,
        })
        .getPaymentToken()

      const result = await updateCardAction({
        cardToken: tokenResult.payment_token,
        cardLast4: digits.slice(-4),
      })

      if (result.error) {
        setIsSubmitting(false)
        setErrorMessage(result.error)
        return
      }

      onSuccess(digits.slice(-4))
    } catch (err: any) {
      setIsSubmitting(false)
      const detail = err?.error_description || err?.error || err?.message
      setErrorMessage(detail ? `Não foi possível processar o cartão: ${detail}` : 'Não foi possível processar o cartão. Confira os dados e tente novamente.')
    }
  }

  const inputClass =
    'w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Trocar cartão</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground -mt-2">
          O novo cartão só será usado a partir da próxima cobrança — nada é cobrado agora.
        </p>

        {errorMessage && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            {errorMessage}
          </div>
        )}

        {!sdkReady && !errorMessage ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando formulário seguro...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="Número do cartão"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              disabled={isSubmitting}
              maxLength={23}
            />
            <div className="grid grid-cols-3 gap-2">
              <select className={inputClass} value={expirationMonth} onChange={(e) => setExpirationMonth(e.target.value)} disabled={isSubmitting}>
                <option value="">MM</option>
                {EXPIRATION_MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className={inputClass} value={expirationYear} onChange={(e) => setExpirationYear(e.target.value)} disabled={isSubmitting}>
                <option value="">AAAA</option>
                {EXPIRATION_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="CVV"
                value={cvv}
                onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
                disabled={isSubmitting}
                maxLength={4}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !sdkReady}
              className="w-full rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2.5 hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Salvando...' : 'Salvar novo cartão'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
