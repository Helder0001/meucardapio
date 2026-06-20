'use client'

// components/dashboard/order-detail.tsx

import { useState, useTransition } from 'react'
import { formatCurrency, formatDate, formatPhone, formatOrderNumber } from '@/lib/utils/format'
import { OrderStatusBadge } from './order-status-badge'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, XCircle, CreditCard } from 'lucide-react'
import { toast } from 'sonner'

const PAYMENT_METHODS: Record<string, string> = {
  PIX:         '⚡ PIX',
  CASH:        '💵 Dinheiro',
  CREDIT_CARD: '💳 Cartão de Crédito',
  DEBIT_CARD:  '💳 Cartão de Débito',
  VOUCHER:     '🎟️ Voucher',
  CASHBACK:    '💰 Cashback',
  TRANSFER:    '🏦 Transferência',
}

// Tradução dos status do histórico para português
const STATUS_PT: Record<string, string> = {
  PENDING:          'Recebido',
  CONFIRMED:        'Confirmado',
  PREPARING:        'Preparando',
  READY:            'Pronto',
  OUT_FOR_DELIVERY: 'Saiu p/ entrega',
  DELIVERED:        'Entregue',
  CANCELLED:        'Cancelado',
}

// Métodos que podem ser confirmados manualmente (não precisam de webhook)
const MANUAL_METHODS = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'VOUCHER', 'TRANSFER']

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

// Para pedidos que não são delivery (mesa, retirada, balcão),
// pula OUT_FOR_DELIVERY e vai direto de READY para DELIVERED.
function getNextStatus(currentStatus: string, orderType: string): string | undefined {
  if (currentStatus === 'READY' && orderType !== 'DELIVERY') return 'DELIVERED'
  return NEXT_STATUS[currentStatus]
}

const NEXT_LABEL: Record<string, string> = {
  PENDING:          'Confirmar pedido',
  CONFIRMED:        'Iniciar preparo',
  PREPARING:        'Marcar como pronto',
  READY:            'Marcar como entregue',   // label genérico — sobrescrito abaixo para delivery
  OUT_FOR_DELIVERY: 'Marcar como entregue',
}

// Operador (STAFF): pode confirmar pedido, marcar pronto e marcar entregue.
// Não pode iniciar preparo (CONFIRMED→PREPARING) — isso é da cozinha/gerente.
function getStaffAction(status: string): { next: string; label: string } | null {
  if (status === 'PENDING')          return { next: 'CONFIRMED',        label: 'Confirmar pedido' }
  if (status === 'READY')            return { next: 'DELIVERED',        label: 'Marcar como entregue' }
  if (status === 'OUT_FOR_DELIVERY') return { next: 'DELIVERED',        label: 'Marcar como entregue' }
  return null
}

// Entregador (DELIVERY_PERSON):
// - Delivery: pode avançar OUT_FOR_DELIVERY → DELIVERED
// - Retirada/Balcão: pode avançar READY → DELIVERED e PENDING → CONFIRMED
function getDeliveryPersonAction(
  status: string, orderType: string
): { next: string; label: string } | null {
  if (orderType === 'DELIVERY') {
    if (status === 'OUT_FOR_DELIVERY') return { next: 'DELIVERED', label: 'Marcar como entregue' }
    return null
  }
  // PICKUP / PDV / TABLE
  if (status === 'PENDING') return { next: 'CONFIRMED', label: 'Confirmar pedido' }
  if (status === 'READY')   return { next: 'DELIVERED', label: 'Marcar como entregue' }
  return null
}

export function OrderDetail({ order, userRole }: { order: any; userRole: string }) {
  const [status,   setStatus]   = useState(order.status)
  const [payments, setPayments] = useState<any[]>(order.payments)
  const [isPending, start]      = useTransition()

  const isAttendant      = userRole === 'ATTENDANT'
  const isStaff          = userRole === 'STAFF'
  const isDeliveryPerson = userRole === 'DELIVERY_PERSON'
  const isRestricted     = isStaff || isDeliveryPerson

  const restrictedAction = isStaff
    ? getStaffAction(status)
    : isDeliveryPerson
      ? getDeliveryPersonAction(status, order.type)
      : null

  // Para ATTENDANT em pedidos de delivery: não avança para OUT_FOR_DELIVERY
  const attendantNextStatus = (isAttendant && order.type === 'DELIVERY' && status === 'READY')
    ? undefined  // nenhuma ação de avanço — deixa para o entregador
    : getNextStatus(status, order.type)

  const advanceTarget = isRestricted
    ? restrictedAction?.next
    : attendantNextStatus
  const advanceLabel = isRestricted
    ? restrictedAction?.label
    : (status === 'READY' && order.type === 'DELIVERY'
        ? 'Saiu para entrega'
        : NEXT_LABEL[status])

  const advanceStatus = () => {
    const next = advanceTarget
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
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Erro ao atualizar status')
      }
    })
  }

  const cancelOrder = () => {
    const reason = prompt('Motivo do cancelamento (opcional):')
    if (reason === null) return
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

  // Marca um pagamento manual como pago
  const markPaymentPaid = (paymentId: string) => {
    start(async () => {
      const res = await fetch(`/api/orders/${order.id}/mark-paid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
      if (res.ok) {
        setPayments((prev) =>
          prev.map((p) =>
            p.id === paymentId ? { ...p, status: 'PAID', paidAt: new Date().toISOString() } : p
          )
        )
        toast.success('Pagamento confirmado!')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Erro ao confirmar pagamento')
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
                <div className="flex flex-col items-center flex-shrink-0">
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
            {advanceTarget && (
              <button
                onClick={advanceStatus}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {advanceLabel}
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
        {/* CORREÇÃO: operador sem ação de avanço disponível neste status */}
        {!isDone && isRestricted && !advanceTarget && (
          <p className="text-xs text-muted-foreground mt-2">
            Este pedido está em preparo na cozinha. Você poderá marcá-lo como entregue quando estiver pronto.
          </p>
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

          {/* Pagamentos — mostra TODOS */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">
              Pagamento{payments.length > 1 ? 's' : ''}
            </h3>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento</p>
            ) : (
              <div className="space-y-3">
                {payments.map((p: any, idx: number) => {
                  const isManual  = MANUAL_METHODS.includes(p.method)
                  const isPaid    = p.status === 'PAID'
                  return (
                    <div key={p.id} className={cn(
                      'rounded-lg p-3 border',
                      isPaid
                        ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800'
                        : 'border-border bg-muted/30'
                    )}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {PAYMENT_METHODS[p.method] ?? p.method}
                          </p>
                          <p className="text-xs font-semibold text-foreground mt-0.5">
                            {formatCurrency(p.amount)}
                          </p>
                          {p.changeAmount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Troco: {formatCurrency(p.changeAmount)}
                            </p>
                          )}
                          {isPaid && p.paidAt && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                              ✓ Pago {formatDate(p.paidAt)}
                            </p>
                          )}
                          {!isPaid && p.method === 'PIX' && (
                            p.pixExpiresAt && new Date(p.pixExpiresAt) < new Date() ? (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                                PIX expirado — gere um novo código
                              </p>
                            ) : (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                Aguardando confirmação PIX
                              </p>
                            )
                          )}
                          {!isPaid && isManual && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Pendente de confirmação
                            </p>
                          )}
                        </div>
                        {/* Confirmar pagamento manual:
                            - Admin, Gerente: sempre
                            - Atendente: só em não-delivery
                            - Operador: sempre
                            - Entregador: só em não-delivery */}
                        {!isPaid && isManual &&
                          !(isAttendant && order.type === 'DELIVERY') &&
                          !(isDeliveryPerson && order.type === 'DELIVERY') && (
                          <button
                            onClick={() => markPaymentPaid(p.id)}
                            disabled={isPending}
                            title="Confirmar recebimento"
                            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
                          >
                            {isPending
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <CreditCard className="h-3 w-3" />
                            }
                            Confirmar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="bg-card border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
            <p>Criado: {formatDate(order.createdAt)}</p>
            {order.waiter    && <p>Operador: <span className="font-medium text-foreground">{order.waiter.name}</span></p>}
            {order.createdBy && !order.waiter && <p>Operador: <span className="font-medium text-foreground">{order.createdBy.name}</span></p>}
            {order.pdv       && <p>PDV: {order.pdv.name}</p>}
            {order.deliveryBairro && <p>Bairro: {order.deliveryBairro}</p>}
            {order.cancelReason   && <p className="text-destructive">Cancelado: {order.cancelReason}</p>}
          </div>

          {/* Histórico de status */}
          {order.statusHistory?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Histórico</h3>
              <div className="space-y-2">
                {order.statusHistory.map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium text-foreground">{STATUS_PT[h.status] ?? h.status}</span>
                      <span className="text-muted-foreground ml-1.5">{formatDate(h.createdAt)}</span>
                      {h.user && (
                        <span className="ml-1.5 text-muted-foreground">
                          · por <span className="font-medium text-foreground">{h.user.name}</span>
                        </span>
                      )}
                      {h.notes && !h.notes.startsWith('Alterado por') && (
                        <p className="text-muted-foreground italic mt-0.5">{h.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
