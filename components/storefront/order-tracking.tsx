'use client'
// components/storefront/order-tracking.tsx

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2, Clock, ChefHat, Package, Truck, Star,
  Copy, Check, ArrowLeft, MapPin, QrCode, RefreshCw, AlertCircle,
} from 'lucide-react'
import { formatCurrency, formatOrderNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { CardPaymentForm } from './card-payment-form'

const STATUS_STEPS = [
  { key: 'PENDING',          label: 'Recebido',    icon: Clock,        desc: 'Aguardando confirmação' },
  { key: 'CONFIRMED',        label: 'Confirmado',  icon: CheckCircle2, desc: 'Pedido aceito' },
  { key: 'PREPARING',        label: 'Preparando',  icon: ChefHat,      desc: 'Na cozinha' },
  { key: 'READY',            label: 'Pronto',      icon: Package,      desc: 'Aguardando entrega' },
  { key: 'OUT_FOR_DELIVERY', label: 'A caminho',   icon: Truck,        desc: 'Saiu para entrega' },
  { key: 'DELIVERED',        label: 'Entregue',    icon: CheckCircle2, desc: 'Bom apetite! 🎉' },
]

const STATUS_MESSAGES: Record<string, { text: string; emoji: string }> = {
  PENDING:          { text: 'Aguardando confirmação do estabelecimento…', emoji: '⏳' },
  CONFIRMED:        { text: 'Pedido confirmado! Será preparado em breve.',  emoji: '✅' },
  PREPARING:        { text: 'Seu pedido está sendo preparado com carinho!', emoji: '👨‍🍳' },
  READY:            { text: 'Pronto! Aguardando retirada ou entregador.',   emoji: '📦' },
  OUT_FOR_DELIVERY: { text: 'Seu pedido está a caminho!',                   emoji: '🛵' },
  DELIVERED:        { text: 'Pedido entregue! Bom apetite!',                emoji: '🎉' },
  CANCELLED:        { text: 'Pedido cancelado.',                            emoji: '❌' },
}

interface Payment {
  method: string
  status: string
  pixQrCode: string | null
  pixQrCodeBase64: string | null
  pixExpiresAt: Date | null
  amount: number
  cardLastDigits?: string | null
}

interface OrderTrackingProps {
  order: {
    id: string
    orderNumber: number
    status: string
    paymentStatus: string
    type: string
    total: number
    subtotal: number
    deliveryFee: number
    discountAmount: number
    cashbackUsed: number
    createdAt: Date
    deliveryBairro: string | null
    notes: string | null
    tenant: { name: string; slug: string; primaryColor: string | null; logo: string | null }
    items: Array<{
      id: string; productName: string; quantity: number
      unitPrice: number; totalPrice: number; notes: string | null
      addons: Array<{ addonName: string; addonPrice: number }>
    }>
    payments: Payment[]
  }
  // ✅ Token HMAC gerado no servidor para autorizar o polling
  statusToken: string
  // Public Key do Mercado Pago do tenant — necessária só se houver pagamento
  // pendente com cartão (Checkout Transparente). Null se o tenant não tem
  // MP conectado ou se o pagamento é PIX/dinheiro.
  mpPublicKey?: string | null
}

// ─── Componente countdown PIX ────────────────────────────────────────────────
function PixCountdown({ expiresAt, onExpired }: { expiresAt: Date | null; onExpired: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    if (!expiresAt) return 0
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  })

  useEffect(() => {
    if (secondsLeft <= 0) { onExpired(); return }
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { onExpired(); clearInterval(timer); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, []) // eslint-disable-line

  if (secondsLeft <= 0) return (
    <div className="flex items-center gap-1.5 text-red-500 text-xs font-bold">
      <AlertCircle className="w-3.5 h-3.5" /> QR Code expirado
    </div>
  )

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const pct  = expiresAt
    ? (secondsLeft / (5 * 60)) * 100
    : 100
  const color = secondsLeft < 60 ? '#ef4444' : secondsLeft < 120 ? '#f97316' : '#10b981'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Expira em</span>
        <span className="text-sm font-black tabular-nums" style={{ color }}>
          {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ─── Seção PIX completa ───────────────────────────────────────────────────────
function PixSection({
  payment,
  color,
  orderId,
  onRefresh,
}: {
  payment: Payment
  color: string
  orderId: string
  onRefresh: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [expired, setExpired] = useState(() => {
    if (!payment.pixExpiresAt) return false
    return new Date(payment.pixExpiresAt).getTime() < Date.now()
  })

  const copyCode = () => {
    if (!payment.pixQrCode) return
    navigator.clipboard.writeText(payment.pixQrCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const qrImageSrc = payment.pixQrCodeBase64
    ? `data:image/png;base64,${payment.pixQrCodeBase64}`
    : null

  if (payment.status === 'PAID') {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-3xl p-5 text-center">
        <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <p className="font-black text-emerald-700 dark:text-emerald-300 text-lg">Pagamento confirmado!</p>
        <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
          {formatCurrency(payment.amount)} via PIX ✅
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
            <QrCode className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <p className="font-black text-gray-900 dark:text-white text-sm">Pague via PIX</p>
            <p className="text-xs text-gray-400">Escaneie o QR Code ou copie o código</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">Valor</p>
            <p className="font-black text-base" style={{ color }}>{formatCurrency(payment.amount)}</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {expired ? (
          <div className="text-center py-8 space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-red-50 dark:bg-red-950/20 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-white">QR Code expirado</p>
              <p className="text-sm text-gray-400 mt-1">Clique abaixo para gerar um novo código PIX</p>
            </div>
            <button
              onClick={onRefresh}
              className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-2xl text-white font-bold text-sm transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
            >
              <RefreshCw className="w-4 h-4" /> Gerar novo PIX
            </button>
          </div>
        ) : (
          <>
            {qrImageSrc ? (
              <div className="flex justify-center">
                <div className="relative p-3 bg-white rounded-2xl shadow-inner border border-gray-100">
                  <img
                    src={qrImageSrc}
                    alt="QR Code PIX"
                    width={200}
                    height={200}
                    className="rounded-xl"
                  />
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="w-52 h-52 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center border border-dashed border-gray-200 dark:border-gray-700">
                  <div className="text-center">
                    <QrCode className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">QR Code sendo gerado…</p>
                  </div>
                </div>
              </div>
            )}

            {payment.pixExpiresAt && (
              <PixCountdown
                expiresAt={new Date(payment.pixExpiresAt)}
                onExpired={() => setExpired(true)}
              />
            )}

            {payment.pixQrCode && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pix Copia e Cola</p>
                <div className="relative">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 pr-12 text-xs font-mono text-gray-600 dark:text-gray-400 break-all leading-relaxed border border-gray-100 dark:border-gray-700 max-h-20 overflow-y-auto">
                    {payment.pixQrCode}
                  </div>
                  <button
                    onClick={copyCode}
                    className="absolute right-2 top-2 w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90"
                    style={{ background: copied ? '#10b981' : `${color}20`, color: copied ? 'white' : color }}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={copyCode}
                  className="w-full py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ background: copied ? '#10b981' : `linear-gradient(135deg, ${color}, ${color}cc)` }}
                >
                  {copied ? <><Check className="w-4 h-4" /> Copiado!</> : <><Copy className="w-4 h-4" /> Copiar código PIX</>}
                </button>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-2xl p-3 space-y-1.5">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-300">Como pagar:</p>
              {[
                'Abra seu banco ou carteira digital',
                'Escolha pagar via PIX',
                'Escaneie o QR Code ou cole o código',
                'Confirme o pagamento',
              ].map((step, i) => (
                <p key={i} className="text-xs text-blue-600 dark:text-blue-400 flex items-start gap-1.5">
                  <span className="font-black flex-shrink-0">{i + 1}.</span>
                  {step}
                </p>
              ))}
            </div>

            <p className="text-[10px] text-center text-gray-400">
              Após o pagamento, o status é atualizado automaticamente em até 30 segundos
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function OrderTracking({ order: initialOrder, statusToken, mpPublicKey }: OrderTrackingProps) {
  const [order, setOrder] = useState(initialOrder)
  const [isRefreshingPix, setIsRefreshingPix] = useState(false)

  const color = order.tenant.primaryColor ?? '#f97316'
  const pendingPayment = order.payments[0] ?? null
  const needsPixPayment = pendingPayment?.method === 'PIX' && order.paymentStatus !== 'PAID'
  const needsCardPayment = pendingPayment?.method === 'CREDIT_CARD' && order.paymentStatus !== 'PAID' && !!mpPublicKey
  const pixPayment = pendingPayment
  const isDelivery = order.type === 'DELIVERY'
  const steps = STATUS_STEPS.filter((s) => isDelivery ? true : s.key !== 'OUT_FOR_DELIVERY')
  const currentStepIndex = steps.findIndex((s) => s.key === order.status)
  const statusMsg = STATUS_MESSAGES[order.status]

  // ✅ Polling de status com token HMAC para autorizar a requisição
  useEffect(() => {
    const isDone = ['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status) && order.paymentStatus === 'PAID'
    if (isDone) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}/status?token=${statusToken}`)
        if (res.ok) {
          const data = await res.json()
          setOrder((prev) => ({
            ...prev,
            status:        data.status        ?? prev.status,
            paymentStatus: data.paymentStatus ?? prev.paymentStatus,
            payments:      data.payments?.length ? data.payments : prev.payments,
          }))
        }
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [order.id, order.status, order.paymentStatus, statusToken])

  // Regenerar PIX expirado
  const handleRefreshPix = useCallback(async () => {
    setIsRefreshingPix(true)
    try {
      // VULN-CRIT-02 CORRIGIDO: a rota exige { token } no corpo — antes esta
      // chamada não enviava body nenhum, então a regeneração de PIX sempre
      // falhava silenciosamente (req.json() vazio → token null → 404).
      const res = await fetch(`/api/orders/${order.id}/regenerate-pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: statusToken }),
      })
      if (res.ok) {
        const data = await res.json()
        setOrder((prev) => ({
          ...prev,
          payments: [data.payment],
        }))
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setIsRefreshingPix(false)
    }
  }, [order.id, statusToken])

  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-gray-950">

      {/* ── HEADER ── */}
      <header className="glass-card border-b border-gray-100/80 dark:border-gray-800 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link
            href={`/menu/${order.tenant.slug}`}
            className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          {order.tenant.logo ? (
            <img src={order.tenant.logo} alt={order.tenant.name}
              className="w-8 h-8 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
              {order.tenant.name[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-gray-400 leading-none">Pedido em</p>
            <p className="font-black text-sm text-gray-900 dark:text-white truncate">{order.tenant.name}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-gray-400 leading-none">Pedido</p>
            <p className="font-black text-sm text-gray-900 dark:text-white">
              #{formatOrderNumber(order.orderNumber)}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* ── PIX (aparece antes do status se ainda não pago) ── */}
        {needsPixPayment && order.status !== 'CANCELLED' && (
          <PixSection
            payment={pixPayment}
            color={color}
            orderId={order.id}
            onRefresh={handleRefreshPix}
          />
        )}

        {needsCardPayment && order.status !== 'CANCELLED' && (
          <CardPaymentForm
            orderId={order.id}
            amount={Number(order.total)}
            publicKey={mpPublicKey!}
            color={color}
            statusToken={statusToken}
            onSuccess={() => {
              setOrder((prev) => ({
                ...prev,
                paymentStatus: 'PAID',
                status: prev.status === 'PENDING' ? 'CONFIRMED' : prev.status,
              }))
            }}
          />
        )}

        {/* ── STATUS HERO CARD ── */}
        {order.status !== 'CANCELLED' && (
          <div className="rounded-3xl overflow-hidden" style={{
            background: `linear-gradient(135deg, ${color}18 0%, ${color}08 100%)`,
            border: `1px solid ${color}22`
          }}>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                  style={{ background: `${color}20` }}>
                  {statusMsg?.emoji ?? '📋'}
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Status atual</p>
                  <p className="font-black text-lg text-gray-900 dark:text-white leading-tight">
                    {steps.find(s => s.key === order.status)?.label ?? order.status}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{statusMsg?.text}</p>
                </div>
                {!['DELIVERED', 'CANCELLED'].includes(order.status) && (
                  <div className="ml-auto w-3 h-3 rounded-full flex-shrink-0 relative">
                    <div className="absolute inset-0 rounded-full animate-ping opacity-60"
                      style={{ background: color }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-1">
                {steps.map((step, i) => {
                  const done    = i < currentStepIndex
                  const current = i === currentStepIndex
                  return (
                    <div key={step.key} className="flex items-center flex-1">
                      <div className={cn(
                        'flex-1 h-1.5 rounded-full transition-all duration-500',
                        done || current ? 'opacity-100' : 'opacity-20'
                      )} style={{ background: done || current ? color : '#e5e7eb' }} />
                      {i < steps.length - 1 && (
                        <div className={cn(
                          'w-2 h-2 rounded-full mx-0.5 flex-shrink-0 transition-all duration-300',
                          done ? 'scale-100' : 'scale-75 opacity-30'
                        )} style={{ background: done ? color : '#e5e7eb' }} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Step labels mobile */}
              <div className="flex justify-between mt-2">
                {steps.filter((_, i) => i === 0 || i === steps.length - 1 || i === currentStepIndex).map((step) => (
                  <p key={step.key} className="text-[10px] text-gray-400 font-medium">{step.label}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RESUMO DO PEDIDO ── */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="px-5 pt-5 pb-3 border-b border-gray-50 dark:border-gray-800">
            <h2 className="font-black text-gray-900 dark:text-white">Resumo do pedido</h2>
          </div>
          <div className="p-5 space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex gap-3">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5"
                  style={{ background: `${color}22`, color }}>
                  {item.quantity}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                    {item.productName}
                  </p>
                  {item.addons.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      + {item.addons.map((a) => a.addonName).join(', ')}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-gray-400 italic mt-0.5">"{item.notes}"</p>
                  )}
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">
                  {formatCurrency(item.totalPrice)}
                </span>
              </div>
            ))}
          </div>

          {/* Totais */}
          <div className="mx-5 border-t border-gray-100 dark:border-gray-800 py-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Entrega {order.deliveryBairro ? `· ${order.deliveryBairro}` : ''}
                </span>
                <span>{formatCurrency(order.deliveryFee)}</span>
              </div>
            )}
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Desconto</span><span>−{formatCurrency(order.discountAmount)}</span>
              </div>
            )}
            {order.cashbackUsed > 0 && (
              <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Cashback usado</span><span>−{formatCurrency(order.cashbackUsed)}</span>
              </div>
            )}
          </div>
          <div className="mx-5 mb-5 flex justify-between items-center p-4 rounded-2xl" style={{ background: `${color}10` }}>
            <span className="font-black text-gray-900 dark:text-white">Total</span>
            <span className="font-black text-xl" style={{ color }}>{formatCurrency(order.total)}</span>
          </div>
        </div>

        {/* ── AVALIAÇÃO ── */}
        {order.status === 'DELIVERED' && (
          <div className="rounded-3xl overflow-hidden border"
            style={{ background: `linear-gradient(135deg, ${color}12, ${color}06)`, borderColor: `${color}20` }}>
            <div className="p-6 text-center">
              <div className="flex justify-center gap-1 mb-3">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} className="w-6 h-6 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="font-black text-gray-900 dark:text-white mb-1">Como foi seu pedido?</p>
              <p className="text-sm text-gray-500 mb-4">Sua avaliação ajuda o estabelecimento a melhorar</p>
              <Link
                href={`/menu/${order.tenant.slug}/pedido/${order.id}/avaliar`}
                className="inline-flex items-center gap-2 text-white px-6 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
              >
                Avaliar pedido ⭐
              </Link>
            </div>
          </div>
        )}

        {/* ── CANCELADO ── */}
        {order.status === 'CANCELLED' && (
          <div className="bg-red-50 dark:bg-red-950/20 rounded-3xl p-6 text-center border border-red-100 dark:border-red-900/40">
            <div className="text-3xl mb-2">❌</div>
            <p className="font-black text-gray-900 dark:text-white mb-1">Pedido cancelado</p>
            <p className="text-sm text-gray-500">Entre em contato com o estabelecimento se precisar de ajuda.</p>
            <Link
              href={`/menu/${order.tenant.slug}`}
              className="mt-4 inline-flex items-center gap-2 text-white px-6 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
            >
              Fazer novo pedido
            </Link>
          </div>
        )}

        <div className="text-center pb-4">
          <Link
            href={`/menu/${order.tenant.slug}`}
            className="text-sm font-semibold transition-colors"
            style={{ color }}
          >
            ← Voltar ao cardápio
          </Link>
        </div>
      </div>
    </div>
  )
}
