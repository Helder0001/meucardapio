'use client'
// components/dashboard/financeiro-client.tsx

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Zap, Banknote, CreditCard, HelpCircle, Calendar } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import { FinanceRatesForm, type FinanceRatesFormProps } from './finance-rates-form'

interface InstantPayment {
  id: string
  method: string
  amount: number
  fee: number | null
  netAmount: number | null
  expectedReceiptDate: string | null
  paidAt: string
  orderNumber: number
  customerName: string | null
}

interface CardPayment {
  id: string
  method: string
  amount: number
  paidAt: string
  orderNumber: number
  customerName: string | null
}

const METHOD_LABEL: Record<string, string> = {
  PIX: '⚡ PIX',
  PIX_MANUAL: '⚡ Pix Chave',
  CASH: '💵 Dinheiro',
  CREDIT_CARD: '💳 Crédito (online)',
  CREDIT_CARD_MANUAL: '💳 Crédito (maquininha)',
  DEBIT_CARD: '💳 Débito (maquininha)',
}

const METHOD_ICON: Record<string, any> = {
  PIX: Zap, PIX_MANUAL: Zap, CASH: Banknote,
  CREDIT_CARD: CreditCard, CREDIT_CARD_MANUAL: CreditCard, DEBIT_CARD: CreditCard,
}

export function FinanceiroClient({
  startDate, endDate, instantPayments, cardPayments, instantTotal, cardTotal, financeRates,
}: {
  startDate: string
  endDate: string
  instantPayments: InstantPayment[]
  cardPayments: CardPayment[]
  instantTotal: number
  cardTotal: number
  financeRates: FinanceRatesFormProps
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [start, setStart] = useState(startDate)
  const [end, setEnd] = useState(endDate)

  const applyFilter = () => {
    startTransition(() => router.push(`/dashboard/financeiro?start=${start}&end=${end}`))
  }

  const grandTotal = instantTotal + cardTotal

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="h-6 w-6" /> Financeiro
        </h1>
        <p className="text-sm text-muted-foreground">Fluxo de recebimentos do período</p>
      </div>

      {/* Filtro de período */}
      <div className="flex flex-wrap items-end gap-3 bg-card border border-border rounded-2xl p-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">De</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 border border-input rounded-lg bg-background text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Até</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="px-3 py-2 border border-input rounded-lg bg-background text-sm" />
        </div>
        <button onClick={applyFilter} disabled={isPending}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-60">
          Aplicar
        </button>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Recebido (com valor líquido calculado)</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(instantTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">PIX, Pix Chave, Dinheiro, Mercado Pago, Asaas — e Efí/maquininha se a taxa estiver configurada</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Sem cálculo automático (bruto)</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(cardTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Efí ou maquininha sem taxa configurada ainda</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Total do período</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(grandTotal)}</p>
        </div>
      </div>

      {/* Recebidos na hora */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-semibold text-foreground mb-1">Com valor líquido calculado</h2>
        <p className="text-xs text-muted-foreground mb-4">PIX, Pix Chave, Dinheiro (sempre) — Mercado Pago e Asaas (dado real do provedor) — Efí e maquininha (se a taxa estiver configurada abaixo).</p>
        {instantPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum recebimento nesse período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-3">Pedido</th>
                  <th className="pb-2 pr-3">Cliente</th>
                  <th className="pb-2 pr-3">Forma</th>
                  <th className="pb-2 pr-3">Bruto</th>
                  <th className="pb-2 pr-3">Taxa</th>
                  <th className="pb-2 pr-3">Líquido</th>
                  <th className="pb-2">Recebido em</th>
                </tr>
              </thead>
              <tbody>
                {instantPayments.map((p) => {
                  const Icon = METHOD_ICON[p.method] ?? Wallet
                  return (
                    <tr key={p.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-foreground">#{String(p.orderNumber).padStart(4, '0')}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{p.customerName ?? '—'}</td>
                      <td className="py-2.5 pr-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium">
                          <Icon className="h-3 w-3" /> {METHOD_LABEL[p.method] ?? p.method}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{formatCurrency(p.amount)}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{p.fee ? formatCurrency(p.fee) : '—'}</td>
                      <td className="py-2.5 pr-3 font-semibold text-foreground">{formatCurrency(p.netAmount ?? p.amount)}</td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(p.paidAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cartão — separado, sem taxa/data prevista */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start gap-2 mb-1">
          <h2 className="font-semibold text-foreground">Sem cálculo automático</h2>
          <span className="group relative inline-flex">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help mt-0.5" />
            <span className="pointer-events-none absolute left-0 top-5 z-20 w-72 rounded-lg border border-border bg-popover text-popover-foreground text-[11px] leading-snug p-2 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity">
              Cartão na maquininha física não passa pela nossa API — não temos como saber a taxa cobrada
              nem o prazo de repasse da adquirente. Cartão online também varia de taxa por parcelamento
              e negociação com o provedor. Por isso aparece aqui só o valor bruto, sem data prevista.
            </span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Sem taxa nem data de recebimento calculadas automaticamente — consulte o extrato da sua maquininha/gateway.</p>
        {cardPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pagamento em cartão nesse período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-3">Pedido</th>
                  <th className="pb-2 pr-3">Cliente</th>
                  <th className="pb-2 pr-3">Forma</th>
                  <th className="pb-2 pr-3">Valor bruto</th>
                  <th className="pb-2">Confirmado em</th>
                </tr>
              </thead>
              <tbody>
                {cardPayments.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-foreground">#{String(p.orderNumber).padStart(4, '0')}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{p.customerName ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-xs font-medium">{METHOD_LABEL[p.method] ?? p.method}</td>
                    <td className="py-2.5 pr-3 font-semibold text-foreground">{formatCurrency(p.amount)}</td>
                    <td className="py-2.5 text-muted-foreground">{formatDate(p.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FinanceRatesForm {...financeRates} />
    </div>
  )
}
