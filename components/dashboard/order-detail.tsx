'use client'

// components/dashboard/order-detail.tsx

import { useState, useTransition } from 'react'
import { formatCurrency, formatDate, formatPhone, formatOrderNumber } from '@/lib/utils/format'
import { OrderStatusBadge } from './order-status-badge'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

const PAYMENT_METHODS: Record<string, string> = {
  PIX:         '⚡ PIX',
  CASH:        '💵 Dinheiro',
  CREDIT_CARD: '💳 Crédito',
  DEBIT_CARD:  '💳 Débito',
  VOUCHER:     '🎟️ Voucher',
  CASHBACK:    '💰 Cashback',
}

const STATUS_FLOW = [
  { key: 'PENDING',           label: 'Recebido' },
  { key: 'CONFIRMED',         label: 'Confirmado' },
  { key: 'PREPARING',         label: 'Preparando' },
  { key: 'READY',             label: 'Pronto' },
  { key: 'OUT_FOR_DELIVERY',  label: 'Saiu p/ entrega' },
  { key: 'DELIVERED',         label: 'Entregue' },
]

const NEXT_STATUS: Record<string, string> = {
  PENDING:          'CONFIRMED',
  CONFIRMED:        'PREPARING',
  PREPARING:        'READY',
  READY:            'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
}

const NEXT_LABEL: Record<string, string> = {
  PENDING:          'Confirmar pedido',
  CONFIRMED:        'Iniciar preparo',
  PREPARING:        'Marcar como pronto',
  READY:            'Saiu para entrega',
  OUT_FOR_DELIVERY: 'Marcar como entregue',
}

export function OrderDetail({ order }: { order: any }) {
  const [status, setStatus] = useState(order.status)
  const [isPending, start]  = useTransition()

  const advanceStatus = () => {
    const next = NEXT_STATUS[status]
    if (!next) return
    start(async () => {
      const res = await fetch(`/api/orders/${order.id}/update-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) {
        setStatus(next)
        toast.success('Status atualizado!')
      } else {
        toast.error('Erro ao atualizar status')
      }
    })
  }

  const cancelOrder = () => {
    const reason = prompt('Motivo do cancelamento (opcional):')
    if (reason === null) return // clicou em cancelar no prompt
    start(async () => {
      const res = await fetch(`/api/orders/${order.id}/update-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', cancelReason: reason }),
      })
      if (res.ok) {
        setStatus('CANCELLED')
        toast.success('Pedido cancelado')
      } else {
        toast.error('Erro ao cancelar')
      }
    })
  }

  const currentStep = STATUS_FLOW.findIndex((s) => s.key === status)
  const isDone      = ['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(status)

  return (
    <div className="space-y-5">
      {/* Status + ações */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <OrderStatusBadge status={status} />
            <span className="text-sm text-muted-foreground">
              {order.type === 'DELIVERY' ? '🛵 Delivery' :
               order.type === 'TABLE'    ? `🍽️ Mesa ${order.table?.number ?? ''}` :
               order.type === 'PICKUP'   ? '🏪 Retirada' : '💳 Balcão'}
            </span>
          </div>
          <span className="text-xl font-bold text-foreground">
            {formatCurrency(order.total)}
          </span>
        </div>

        {/* Linha do tempo */}
        <div className="flex items-center gap-0 mb-5 overflow-x-auto">
          {STATUS_FLOW.filter((s) =>
            order.type !== 'DELIVERY' ? s.key !== 'OUT_FOR_DELIVERY' : true
          ).map((s, i, arr) => {
            const stepIdx = STATUS_FLOW.findIndex((x) => x.key === s.key)
            const done    = stepIdx < currentStep
            const current = stepIdx === currentStep
            return (
              <div key={s.key} className="flex items-center flex-1 min-w-0">
                <div className={cn(
                  'flex flex-col items-center flex-shrink-0',
                )}>
                  <div className={cn(
                    'w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all',
                    done    ? 'bg-emerald-500 border-emerald-500 text-white' :
                    current ? 'bg-orange-500 border-orange-500 text-white ring-4 ring-orange-500/20' :
                              'bg-muted border-border text-muted-foreground'
                  )}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className="text-[9px] mt-1 text-muted-foreground whitespace-nowrap">{s.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <div className={cn(
                    'flex-1 h-0.5 mx-1',
                    stepIdx < currentStep ? 'bg-emerald-500' : 'bg-border'
                  )} />
                )}
              </div>
            )
          })}
        </div>

        {/* Botões de ação */}
        {!isDone && (
          <div className="flex gap-3">
            {NEXT_STATUS[status] && (
              <button
                onClick={advanceStatus}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {NEXT_LABEL[status]}
              </button>
            )}
            <button
              onClick={cancelOrder}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2.5 border border-destructive/30 text-destructive text-sm font-medium rounded-lg hover:bg-destructive/5 disabled:opacity-60 transition-colors"
            >
              <XCircle className="h-4 w-4" />
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Itens do pedido */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Itens do pedido</h2>
          <div className="space-y-3">
            {order.items.map((item: any) => (
              <div key={item.id} className="flex justify-between gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.quantity}× {item.productName}
                  </p>
                  {item.addons.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      + {item.addons.map((a: any) => a.addonName).join(', ')}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 italic mt-0.5">
                      Obs: {item.notes}
                    </p>
                  )}
                </div>
                <p className="font-medium text-foreground text-sm flex-shrink-0">
                  {formatCurrency(item.totalPrice)}
                </p>
              </div>
            ))}
          </div>

          {/* Totais */}
          <div className="border-t border-border mt-4 pt-4 space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Entrega</span><span>{formatCurrency(order.deliveryFee)}</span>
              </div>
            )}
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                <span>Desconto {order.coupon ? `(${order.coupon.code})` : ''}</span>
                <span>-{formatCurrency(order.discountAmount)}</span>
              </div>
            )}
            {order.cashbackUsed > 0 && (
              <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                <span>Cashback usado</span><span>-{formatCurrency(order.cashbackUsed)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
              <span>Total</span><span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Info lateral */}
        <div className="space-y-4">
          {/* Cliente */}
          {order.customer && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Cliente</h3>
              <p className="font-medium text-foreground">{order.customer.name ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{formatPhone(order.customer.phone)}</p>
              {order.customer.email && (
                <p className="text-xs text-muted-foreground">{order.customer.email}</p>
              )}
              <div className="flex gap-3 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                <span>{order.customer.totalOrders} pedidos</span>
                <span>{formatCurrency(order.customer.totalSpent)} gastos</span>
              </div>
            </div>
          )}

          {/* Pagamento */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Pagamento</h3>
            {order.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento</p>
            ) : order.payments.map((p: any) => (
              <div key={p.id}>
                <p className="text-sm font-medium text-foreground">{PAYMENT_METHODS[p.method] ?? p.method}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(p.amount)}</p>
                {p.paidAt && <p className="text-xs text-emerald-600 dark:text-emerald-400">Pago {formatDate(p.paidAt)}</p>}
                {p.changeAmount && <p className="text-xs text-muted-foreground">Troco: {formatCurrency(p.changeAmount)}</p>}
              </div>
            ))}
          </div>

          {/* Meta */}
          <div className="bg-card border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
            <p>Criado: {formatDate(order.createdAt)}</p>
            {order.waiter && <p>Garçom: {order.waiter.name}</p>}
            {order.pdv    && <p>PDV: {order.pdv.name}</p>}
            {order.deliveryBairro && <p>Bairro: {order.deliveryBairro}</p>}
            {order.cancelReason   && <p className="text-destructive">Cancelado: {order.cancelReason}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
