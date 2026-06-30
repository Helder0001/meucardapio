'use client'

// components/dashboard/order-detail.tsx

import { useState, useTransition } from 'react'
import { formatCurrency, formatDate, formatPhone, formatOrderNumber } from '@/lib/utils/format'
import { OrderStatusBadge } from './order-status-badge'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, XCircle, CreditCard, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

type AddPaymentMethod = 'PIX' | 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'VOUCHER' | 'TRANSFER'
interface AddPaymentEntry { method: AddPaymentMethod; amount: number }

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

// Regras de avanço de status por role e tipo de pedido:
//
// DELIVERY_PERSON → só pedidos DELIVERY, fluxo completo (todas as etapas)
// STAFF           → todos os tipos EXCETO marcar DELIVERED em DELIVERY
// ATTENDANT       → todos os tipos EXCETO marcar DELIVERED em DELIVERY
// MANAGER/ADMIN   → tudo liberado

function getAllowedNextStatus(
  status: string, orderType: string, role: string
): { next: string; label: string } | undefined {
  const isDelivery = orderType === 'DELIVERY'

  // DELIVERY_PERSON: só pedidos DELIVERY, só saiu-p/entrega e entregue
  if (role === 'DELIVERY_PERSON') {
    if (!isDelivery) return undefined
    if (status === 'READY')            return { next: 'OUT_FOR_DELIVERY', label: 'Saiu para entrega' }
    if (status === 'OUT_FOR_DELIVERY') return { next: 'DELIVERED',        label: 'Marcar como entregue' }
    return undefined
  }

  // STAFF: pode confirmar, preparar, pronto — mas NÃO entregue
  if (role === 'STAFF') {
    if (['PENDING', 'CONFIRMED', 'PREPARING'].includes(status)) {
      return { next: getNextStatus(status, orderType)!, label: NEXT_LABEL[status] }
    }
    return undefined // READY e OUT_FOR_DELIVERY: sem ação de avanço
  }

  // MANAGER / TENANT_ADMIN: fluxo completo
  const next = getNextStatus(status, orderType)
  if (!next) return undefined
  const label = status === 'READY' && isDelivery ? 'Saiu para entrega' : (NEXT_LABEL[status] ?? '')
  return { next, label }
}

export function OrderDetail({ order, userRole }: { order: any; userRole: string }) {
  const [status,   setStatus]   = useState(order.status)
  const [payments, setPayments] = useState<any[]>(order.payments)
  const [isPending, start]      = useTransition()

  // ── Modal de pagamento posterior ──────────────────────────────────────────
  const [showAddPayment, setShowAddPayment]     = useState(false)
  const [addPayments, setAddPayments]           = useState<AddPaymentEntry[]>([{ method: 'CASH', amount: Number(order.total) }])
  const [isAddingPayment, startAddPayment]      = useTransition()
  // QR Code PIX após registrar pagamento posterior
  const [addPixData, setAddPixData]             = useState<{ qrCode: string; qrCodeBase64: string } | null>(null)
  const [addPixCopied, setAddPixCopied]         = useState(false)

  // ── Link de pagamento (Checkout Pro) ──────────────────────────────────────
  const [isSendingLink, setIsSendingLink]       = useState(false)
  const [paymentLinkUrl, setPaymentLinkUrl]     = useState<string | null>(null)

  const totalOrder   = Number(order.total)
  const alreadyPaid  = payments.reduce((s: number, p: any) => s + Number(p.amount), 0)
  const stillOwed    = Math.max(0, Math.round((totalOrder - alreadyPaid) * 100) / 100)

  const addPaymentsSum      = addPayments.reduce((s, p) => s + (p.amount || 0), 0)
  const addPaymentRemaining = Math.round((stillOwed - addPaymentsSum) * 100) / 100

  // Só mostra o botão de adicionar pagamento em pedidos PDV/TABLE/PICKUP
  // com pagamento pendente (cobrar no final ou pagamento ainda não registrado)
  const canAddPayment =
    order.type !== 'DELIVERY' &&
    !['CANCELLED', 'REFUNDED'].includes(status) &&
    stillOwed > 0 &&
    ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF'].includes(userRole)

  const handleAddPayment = () => {
    if (addPaymentsSum < stillOwed - 0.01) {
      toast.error(`Valor insuficiente. Ainda faltam ${formatCurrency(stillOwed - addPaymentsSum)}.`)
      return
    }
    startAddPayment(async () => {
      const res = await fetch(`/api/orders/${order.id}/add-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payments: addPayments }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Erro ao registrar pagamento'); return }

      // Atualizar lista de pagamentos localmente
      setPayments((prev) => [
        ...prev,
        ...(data.payments ?? []).map((p: any) => ({
          ...p,
          paidAt: null,
          changeAmount: null,
          pixExpiresAt: null,
        })),
      ])
      setShowAddPayment(false)
      setAddPayments([{ method: 'CASH', amount: stillOwed }])

      // Se veio QR Code PIX, exibir modal
      if (data.pixQrCode && data.pixQrCodeBase64) {
        setAddPixData({ qrCode: data.pixQrCode, qrCodeBase64: data.pixQrCodeBase64 })
      } else {
        toast.success('Pagamento registrado! Confirme o recebimento quando efetivado.')
      }
    })
  }

  // Gera um link de pagamento (Checkout Pro) e abre o WhatsApp com a
  // mensagem pronta para o garçom enviar ao cliente. Funciona com qualquer
  // método (PIX, crédito, débito) — o cliente escolhe na página do MP.
  const handleSendPaymentLink = async () => {
    setIsSendingLink(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/payment-link`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Não foi possível gerar o link de pagamento')
        return
      }

      setPaymentLinkUrl(data.checkoutUrl)

      const phone = order.customer?.phone?.replace(/\D/g, '')
      const message = `Olá! Segue o link para pagamento do seu pedido #${String(order.orderNumber).padStart(4, '0')} (${formatCurrency(stillOwed)}): ${data.checkoutUrl}`

      if (phone) {
        const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        window.open(waUrl, '_blank')
      } else {
        // Sem telefone cadastrado — copia o link para a área de transferência
        await navigator.clipboard.writeText(data.checkoutUrl)
        toast.success('Link copiado! Cole para enviar ao cliente.')
      }
    } finally {
      setIsSendingLink(false)
    }
  }

  const copyAddPixCode = async () => {
    if (!addPixData) return
    try {
      await navigator.clipboard.writeText(addPixData.qrCode)
      setAddPixCopied(true)
      setTimeout(() => setAddPixCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  const isAttendant      = userRole === 'ATTENDANT'
  const isStaff          = userRole === 'STAFF'
  const isDeliveryPerson = userRole === 'DELIVERY_PERSON'

  const nextAction   = getAllowedNextStatus(status, order.type, userRole)
  const advanceTarget = nextAction?.next
  const advanceLabel  = nextAction?.label

  // Confirmar pagamento manual:
  // - DELIVERY_PERSON: só após DELIVERED (pedido entregue, cobrança no ato)
  // - ATTENDANT e STAFF: bloqueados em pedidos DELIVERY
  // - Admin/Gerente: sempre
  const canConfirmPayment = (payment: any) => {
    if (payment.status === 'PAID') return false
    const isManualMethod = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD'].includes(payment.method)
    if (!isManualMethod) return false
    if (isDeliveryPerson) {
      // Entregador só confirma pagamento de pedidos DELIVERY, e só após entregue
      return order.type === 'DELIVERY' && status === 'DELIVERED'
    }
    if (order.type === 'DELIVERY') {
      // ATTENDANT e STAFF não confirmam pagamento de delivery
      if (isAttendant || isStaff) return false
    }
    return true
  }

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
            {/* Cancelar — Atendente e Entregador não podem cancelar */}
            {!isAttendant && !isDeliveryPerson && (
              <button
                onClick={cancelOrder}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2.5 border border-destructive/30 text-destructive text-sm font-medium rounded-lg hover:bg-destructive/5 disabled:opacity-60 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Cancelar
              </button>
            )}
          </div>
        )}
        {/* CORREÇÃO: operador sem ação de avanço disponível neste status */}
        {!isDone && (isStaff || isDeliveryPerson || isAttendant) && !advanceTarget && (
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">
                Pagamento{payments.length > 1 ? 's' : ''}
              </h3>
              <div className="flex items-center gap-3">
                {/* Link de pagamento via WhatsApp — qualquer método */}
                {stillOwed > 0 && (
                  <button
                    onClick={handleSendPaymentLink}
                    disabled={isSendingLink}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {isSendingLink ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
                    Enviar link de pagamento
                  </button>
                )}
                {/* NOVO: botão para adicionar pagamento posterior */}
                {canAddPayment && !showAddPayment && (
                  <button
                    onClick={() => {
                      setAddPayments([{ method: 'CASH', amount: stillOwed }])
                      setShowAddPayment(true)
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Registrar pagamento
                  </button>
                )}
              </div>
            </div>

            {paymentLinkUrl && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 mb-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground">Link gerado:</p>
                <p className="text-xs text-muted-foreground break-all font-mono">{paymentLinkUrl}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(paymentLinkUrl).then(() => toast.success('Copiado!'))}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Copiar link
                </button>
              </div>
            )}

            {/* NOVO: Banner de pagamento pendente */}
            {stillOwed > 0 && payments.length === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 mb-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  ⏳ Pagamento pendente — {formatCurrency(stillOwed)}
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                  Este pedido foi criado com "cobrar no final". Use o botão acima para registrar o pagamento.
                </p>
              </div>
            )}

            {stillOwed > 0 && payments.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-2.5 mb-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Saldo restante: {formatCurrency(stillOwed)}
                </p>
              </div>
            )}

            {/* NOVO: Formulário inline de adicionar pagamento */}
            {showAddPayment && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 mb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Registrar pagamento</p>
                  <button onClick={() => setShowAddPayment(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Total a receber: <strong className="text-foreground">{formatCurrency(stillOwed)}</strong>
                </p>

                {addPayments.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={p.method}
                      onChange={(e) => setAddPayments((prev) => prev.map((x, i) => i === idx ? { ...x, method: e.target.value as AddPaymentMethod } : x))}
                      className="flex-1 px-2 py-1.5 text-xs border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="CASH">💵 Dinheiro</option>
                      <option value="CREDIT_CARD">💳 Crédito</option>
                      <option value="DEBIT_CARD">💳 Débito</option>
                      <option value="PIX">⚡ PIX</option>
                      <option value="VOUCHER">🎟️ Voucher</option>
                      <option value="TRANSFER">🏦 Transferência</option>
                    </select>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={p.amount || ''}
                      onChange={(e) => setAddPayments((prev) => prev.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))}
                      placeholder="0,00"
                      className="w-24 px-2 py-1.5 text-xs border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {addPayments.length > 1 && (
                      <button
                        onClick={() => setAddPayments((prev) => prev.filter((_, i) => i !== idx))}
                        className="w-6 h-6 flex-shrink-0 rounded-md bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setAddPayments((prev) => [...prev, { method: 'CASH', amount: Math.max(addPaymentRemaining, 0) }])}
                    className="text-[10px] font-medium text-primary hover:underline"
                  >
                    + Dividir em outra forma
                  </button>
                  {addPayments.length > 1 && (
                    <span className={cn('text-[10px] font-semibold', addPaymentRemaining === 0 ? 'text-emerald-600' : 'text-amber-600')}>
                      {addPaymentRemaining > 0
                        ? `Faltam ${formatCurrency(addPaymentRemaining)}`
                        : addPaymentRemaining < 0
                          ? `Excede em ${formatCurrency(-addPaymentRemaining)}`
                          : 'OK ✓'}
                    </span>
                  )}
                </div>

                <button
                  onClick={handleAddPayment}
                  disabled={isAddingPayment || addPaymentsSum <= 0}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {isAddingPayment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                  {isAddingPayment ? 'Registrando...' : 'Confirmar pagamento'}
                </button>
              </div>
            )}

            {payments.length === 0 && !showAddPayment ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado</p>
            ) : payments.length > 0 ? (
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
                        {/* Confirmar pagamento — controlado por canConfirmPayment() */}
                        {canConfirmPayment(p) && (
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
            ) : null}
          </div>

          {/* Meta + Endereço de entrega */}
          <div className="bg-card border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
            <p>Criado: {formatDate(order.createdAt)}</p>
            {order.waiter    && <p>Operador: <span className="font-medium text-foreground">{order.waiter.name}</span></p>}
            {order.createdBy && !order.waiter && <p>Operador: <span className="font-medium text-foreground">{order.createdBy.name}</span></p>}
            {order.pdv       && <p>PDV: {order.pdv.name}</p>}
            {order.type === 'DELIVERY' && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="font-semibold text-foreground mb-1">🛵 Endereço de entrega</p>
                {order.deliveryAddress && (() => {
                  const raw = order.deliveryAddress
                  // Pode ser { address: "rua xxx" } ou objeto estruturado
                  const addrStr = typeof raw === 'object' && raw !== null
                    ? (raw as any).address ?? JSON.stringify(raw)
                    : String(raw)
                  return <p>{addrStr}</p>
                })()}
                {order.deliveryBairro && (
                  <p className="mt-0.5">Bairro: {order.deliveryBairro}</p>
                )}
                {!order.deliveryAddress && !order.deliveryBairro && (
                  <p className="italic text-muted-foreground">Endereço não informado</p>
                )}
              </div>
            )}
            {order.cancelReason && <p className="text-destructive">Cancelado: {order.cancelReason}</p>}
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

      {/* ── Modal QR Code PIX (pagamento posterior) ───────────────────────── */}
      {addPixData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAddPixData(null)} />
          <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4">
            <div className="text-center">
              <h3 className="font-bold text-foreground text-lg">Aguardando PIX</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Peça ao cliente escanear o QR Code ou usar o código copia e cola. Expira em 5 minutos.
              </p>
            </div>
            <img
              src={`data:image/png;base64,${addPixData.qrCodeBase64}`}
              alt="QR Code PIX"
              className="w-52 h-52 rounded-xl border border-border"
            />
            <div className="w-full">
              <p className="text-xs font-medium text-foreground mb-1">Código copia e cola</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={addPixData.qrCode}
                  className="flex-1 px-3 py-2 text-xs border border-input rounded-lg bg-muted truncate"
                />
                <button
                  onClick={copyAddPixCode}
                  className="px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex-shrink-0"
                >
                  {addPixCopied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setAddPixData(null)}
              className="w-full px-4 py-2.5 bg-muted text-foreground text-sm font-semibold rounded-lg hover:bg-muted/70 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
