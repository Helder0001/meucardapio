'use client'

// app/(dashboard)/dashboard/settings/subscription/subscription-client.tsx

import { useState, useTransition } from 'react'
import { Loader2, XCircle, CreditCard, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { cancelSubscriptionAction } from '@/actions/billing/cancel-subscription'

const BILLING_CYCLE_LABELS: Record<string, string> = {
  MONTHLY: 'Mensal',
  ANNUAL: 'Anual',
}

const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter',
  PRO: 'PRO',
  PREMIUM: 'Premium',
}

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
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function SubscriptionClient({ subscription, payments }: SubscriptionClientProps) {
  const [isCancelling, startCancel] = useTransition()
  const [sub, setSub] = useState(subscription)

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
          <button
            onClick={handleCancelSubscription}
            disabled={isCancelling}
            className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive text-sm font-medium rounded-lg hover:bg-destructive/20 disabled:opacity-60 transition-colors"
          >
            {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Cancelar assinatura
          </button>
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
    </div>
  )
}
