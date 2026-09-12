'use client'
// components/dashboard/financeiro-client.tsx

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Zap, Banknote, CreditCard, HelpCircle, Clock } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { FinanceRatesForm, type FinanceRatesFormProps } from './finance-rates-form'

interface PaymentRow {
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

// CORREÇÃO (#4): rótulos alinhados com a regra de nome — cartão no
// checkout do cardápio digital (via Efí) é sempre "Online"; cartão
// passado na maquininha física (PDV/balcão, entrega, retirada) é sempre
// "Maquininha", nunca tem nome de provedor porque a maquininha física não
// fala com nenhuma API nossa.
const METHOD_LABEL: Record<string, string> = {
  PIX: '⚡ PIX',
  PIX_MANUAL: '⚡ Pix Chave',
  CASH: '💵 Dinheiro',
  CREDIT_CARD: '💳 Crédito (Online)',
  CREDIT_CARD_MANUAL: '💳 Crédito (Maquininha)',
  DEBIT_CARD: '💳 Débito (Maquininha)',
}

const METHOD_ICON: Record<string, any> = {
  PIX: Zap, PIX_MANUAL: Zap, CASH: Banknote,
  CREDIT_CARD: CreditCard, CREDIT_CARD_MANUAL: CreditCard, DEBIT_CARD: CreditCard,
}

function PaymentTable({ rows, showCredito }: { rows: PaymentRow[]; showCredito: boolean }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pagamento nesse período.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="pb-2 pr-3">Pedido</th>
            <th className="pb-2 pr-3">Cliente</th>
            <th className="pb-2 pr-3">Forma</th>
            <th className="pb-2 pr-3">Bruto</th>
            {showCredito && <th className="pb-2 pr-3">Taxa</th>}
            {showCredito && <th className="pb-2 pr-3">Líquido</th>}
            {/* CORREÇÃO (#1): "Recebido em" renomeado pra "Data da Venda"
                (é quando o pagamento foi CONFIRMADO, não quando o dinheiro
                efetivamente caiu) + nova coluna "Data do Crédito" (quando
                o valor líquido realmente cai, já contando em dias úteis —
                ver lib/finance/compute-receipt.ts). */}
            <th className="pb-2 pr-3">Data da Venda</th>
            {showCredito && <th className="pb-2">Data do Crédito</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
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
                {showCredito && <td className="py-2.5 pr-3 text-muted-foreground">{p.fee ? formatCurrency(p.fee) : '—'}</td>}
                {showCredito && <td className="py-2.5 pr-3 font-semibold text-foreground">{formatCurrency(p.netAmount ?? p.amount)}</td>}
                <td className="py-2.5 pr-3 text-muted-foreground">{formatDate(p.paidAt)}</td>
                {showCredito && (
                  <td className="py-2.5 text-muted-foreground">
                    {p.expectedReceiptDate ? formatDate(p.expectedReceiptDate) : '—'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function FinanceiroClient({
  startDate, endDate, dateField, orderNumber, method,
  receivedPayments, upcomingPayments, uncalculatedPayments,
  receivedTotal, upcomingTotal, uncalculatedTotal, financeRates,
}: {
  startDate: string
  endDate: string
  dateField: 'venda' | 'credito'
  orderNumber: string
  method: string
  receivedPayments: PaymentRow[]
  upcomingPayments: PaymentRow[]
  uncalculatedPayments: PaymentRow[]
  receivedTotal: number
  upcomingTotal: number
  uncalculatedTotal: number
  financeRates: FinanceRatesFormProps
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [start, setStart] = useState(startDate)
  const [end, setEnd] = useState(endDate)
  const [field, setField] = useState(dateField)
  const [order, setOrder] = useState(orderNumber)
  const [meth, setMeth] = useState(method)

  const applyFilter = () => {
    const qs = new URLSearchParams({ start, end, dateField: field })
    if (order.trim()) qs.set('orderNumber', order.trim())
    if (meth) qs.set('method', meth)
    startTransition(() => router.push(`/dashboard/financeiro?${qs.toString()}`))
  }

  const grandTotal = receivedTotal + upcomingTotal + uncalculatedTotal

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="h-6 w-6" /> Financeiro
        </h1>
        <p className="text-sm text-muted-foreground">Fluxo de recebimentos do período</p>
      </div>

      {/* CORREÇÃO (#2): filtros — período (por Data da Venda OU Data do
          Crédito, à sua escolha), número do pedido e forma de pagamento. */}
      <div className="flex flex-wrap items-end gap-3 bg-card border border-border rounded-2xl p-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Filtrar período por</label>
          <select value={field} onChange={(e) => setField(e.target.value as 'venda' | 'credito')}
            className="px-3 py-2 border border-input rounded-lg bg-background text-sm">
            <option value="venda">Data da Venda</option>
            <option value="credito">Data do Crédito</option>
          </select>
        </div>
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
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Pedido nº</label>
          <input type="text" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)}
            placeholder="ex: 378" className="w-24 px-3 py-2 border border-input rounded-lg bg-background text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Forma de pagamento</label>
          <select value={meth} onChange={(e) => setMeth(e.target.value)}
            className="px-3 py-2 border border-input rounded-lg bg-background text-sm">
            <option value="">Todas</option>
            {Object.entries(METHOD_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label.replace(/^[^\s]+\s/, '')}</option>
            ))}
          </select>
        </div>
        <button onClick={applyFilter} disabled={isPending}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-60">
          Aplicar
        </button>
      </div>

      {/* Totais — CORREÇÃO (#1): "Recebido" e "A receber" agora são dois
          cartões separados, decididos pela Data do Crédito (hoje ou antes
          = já recebido; data futura = ainda a receber). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Recebido</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(receivedTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Data do Crédito já chegou (hoje ou antes)</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> A receber
          </p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(upcomingTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Data do Crédito ainda não chegou</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Sem cálculo automático (bruto)</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(uncalculatedTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Efí ou maquininha sem taxa configurada ainda</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Total do período</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(grandTotal)}</p>
        </div>
      </div>

      {/* Recebido */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-semibold text-foreground mb-1">Recebido</h2>
        <p className="text-xs text-muted-foreground mb-4">PIX, Pix Chave, Dinheiro (sempre D+0) — Mercado Pago, Asaas, Efí e maquininha cuja Data do Crédito já passou.</p>
        <PaymentTable rows={receivedPayments} showCredito />
      </div>

      {/* A receber */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-semibold text-foreground mb-1">A receber</h2>
        <p className="text-xs text-muted-foreground mb-4">Valor líquido já calculado, mas a Data do Crédito ainda está no futuro — o dinheiro ainda não caiu.</p>
        <PaymentTable rows={upcomingPayments} showCredito />
      </div>

      {/* Sem cálculo automático */}
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
        <p className="text-xs text-muted-foreground mb-4">Sem taxa nem Data do Crédito calculadas automaticamente — consulte o extrato da sua maquininha/gateway. Configure a taxa abaixo pra isso passar a cair em "Recebido"/"A receber".</p>
        <PaymentTable rows={uncalculatedPayments} showCredito={false} />
      </div>

      <FinanceRatesForm {...financeRates} />
    </div>
  )
}
