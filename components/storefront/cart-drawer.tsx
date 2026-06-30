'use client'
// components/storefront/cart-drawer.tsx — pagamento múltiplo + endereço obrigatório

import { useState, useEffect } from 'react'
import { X, Trash2, Plus, Minus, Tag, Loader2, ArrowRight, ShoppingBag, Truck, Store, MapPin, PlusCircle, MinusCircle } from 'lucide-react'
import { useCartStore } from '@/lib/store/cart'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import { createOrderAction } from '@/actions/orders/create-order'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface CartDrawerProps {
  open: boolean
  onClose: () => void
  tenant: {
    id: string
    slug: string
    primaryColor?: string | null
    settings?: any
    pixEnabled?: boolean
    deliveryZones: Array<{
      id: string
      bairro: string | null
      fee: number
      freeAbove: number | null
      minOrder: number | null
      name: string | null
    }>
  }
  tableInfo: { id: string; number: number } | null
}

type Step = 'cart' | 'info' | 'payment'
// CORREÇÃO: separar crédito e débito
type PaymentMethodValue = 'PIX' | 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD'

const STEPS: Step[] = ['cart', 'info', 'payment']
const STEP_LABELS = { cart: 'Carrinho', info: 'Seus dados', payment: 'Pagamento' }

const ALL_PAYMENT_OPTIONS: { value: PaymentMethodValue; label: string; sub: string }[] = [
  { value: 'PIX',         label: '⚡ PIX',          sub: 'Confirmação automática' },
  { value: 'CASH',        label: '💵 Dinheiro',      sub: 'Pague na entrega/retirada' },
  { value: 'CREDIT_CARD', label: '💳 Crédito',       sub: 'Cartão de crédito' },
  { value: 'DEBIT_CARD',  label: '💳 Débito',        sub: 'Cartão de débito' },
]

interface PaymentEntry {
  id: string
  method: PaymentMethodValue
  amount: string
  changeFor: string
}

function newEntry(method: PaymentMethodValue = 'PIX'): PaymentEntry {
  return { id: Math.random().toString(36).slice(2), method, amount: '', changeFor: '' }
}

export function CartDrawer({ open, onClose, tenant, tableInfo }: CartDrawerProps) {
  const router = useRouter()
  const color = tenant.primaryColor ?? '#f97316'
  const pixEnabled = tenant.pixEnabled ?? tenant.settings?.pixEnabled ?? true
  const PAYMENT_OPTIONS = pixEnabled ? ALL_PAYMENT_OPTIONS : ALL_PAYMENT_OPTIONS.filter(o => o.value !== 'PIX')

  // Busca CEP via ViaCEP e identifica zona de entrega
  const handleCepLookup = async (rawCep: string) => {
    const digits = rawCep.replace(/\D/g, '')
    setCep(rawCep)
    if (digits.length !== 8) { setCepError(''); setCepZone(null); return }
    setCepLoading(true); setCepError('')
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) { setCepError('CEP não encontrado.'); setCepZone(null); return }
      // Preenche endereço automaticamente
      setDeliveryAddress(`${data.logradouro || ''}, ${data.bairro || ''}, ${data.localidade || ''}`)
      // Tenta encontrar zona de entrega pelo bairro
      const bairroNorm = (data.bairro || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const zone = tenant.deliveryZones.find(z => {
        const zBairro = (z.bairro || z.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        return zBairro && bairroNorm.includes(zBairro)
      })
      if (zone) {
        setCepZone(zone)
        setDeliveryBairro(zone.bairro)
        setCepError('')
      } else {
        setCepZone(null)
        setCepError('Seu CEP está fora da área de entrega.')
        setDeliveryBairro(null)
      }
    } catch { setCepError('Erro ao buscar CEP. Verifique sua conexão.') }
    finally { setCepLoading(false) }
  }

  const [step, setStep]               = useState<Step>('cart')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [phone, setPhone]             = useState('')
  const [name, setName]               = useState('')
  const [payments, setPayments]       = useState<PaymentEntry[]>([newEntry('PIX')])
  const [couponInput, setCouponInput] = useState('')
  const [couponDiscount, setCouponDiscount] = useState(0)
  const [couponDescription, setCouponDescription] = useState('')
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [cep, setCep] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState('')
  const [cepZone, setCepZone] = useState<typeof tenant.deliveryZones[0] | null>(null)

  // ── Cashback / fidelidade ────────────────────────────────────────────────
  const [cashbackBalance, setCashbackBalance] = useState(0)
  const [loyaltyPoints, setLoyaltyPoints]     = useState(0)
  const [loyaltyConfig, setLoyaltyConfig]     = useState<{ redeemEvery: number; redeemValue: number; minPointsRedeem: number } | null>(null)
  const [cashbackToUse, setCashbackToUse]     = useState(0)
  const [useCashback, setUseCashback]         = useState(false)
  const [pointsToRedeem, setPointsToRedeem]   = useState(0)
  const [usePoints, setUsePoints]             = useState(false)

  const {
    items, couponCode, deliveryType, deliveryBairro, tableId, customerPhone,
    removeItem, updateQuantity, setCoupon, setDeliveryType, setDeliveryBairro,
    setCustomer, subtotal, clearCart,
  } = useCartStore()

  // Buscar saldo de cashback/pontos quando o cliente está identificado
  useEffect(() => {
    const phone = customerPhone
    if (!phone || !tenant.id) { setCashbackBalance(0); setLoyaltyPoints(0); return }
    fetch(`/api/storefront/customer?phone=${encodeURIComponent(phone)}&tenantId=${tenant.id}`)
      .then((r) => r.json())
      .then((d) => {
        setCashbackBalance(d.customer?.cashbackBalance ?? 0)
        setLoyaltyPoints(d.customer?.loyaltyPoints ?? 0)
        setLoyaltyConfig(d.loyaltyConfig ?? null)
      })
      .catch(() => {})
  }, [customerPhone, tenant.id])

  const selectedZone = deliveryBairro
    ? tenant.deliveryZones.find((z) => z.bairro === deliveryBairro)
    : null
  const deliveryFee = selectedZone
    ? (selectedZone.freeAbove && subtotal() >= selectedZone.freeAbove ? 0 : selectedZone.fee)
    : 0
  // Desconto de pontos — calcula em R$ baseado no config do lojista
  const pointsDiscount = (() => {
    if (!usePoints || !loyaltyConfig || pointsToRedeem <= 0) return 0
    const blocks = Math.floor(pointsToRedeem / loyaltyConfig.redeemEvery)
    return blocks * loyaltyConfig.redeemValue
  })()

  const estimatedTotal = Math.max(0, subtotal() + deliveryFee - couponDiscount - (useCashback ? cashbackToUse : 0) - pointsDiscount)

  const stepIndex = STEPS.indexOf(step)
  const isTableOrder = !!(tableId || tableInfo)

  const totalAllocated = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const remaining      = Math.max(0, estimatedTotal - totalAllocated)
  const isFullyAllocated = Math.abs(totalAllocated - estimatedTotal) < 0.01

  const addPayment = () => {
    const rest = Math.max(0, estimatedTotal - totalAllocated)
    setPayments((prev) => [...prev, { ...newEntry('CASH'), amount: rest > 0 ? rest.toFixed(2) : '' }])
  }

  const removePayment = (id: string) => {
    if (payments.length === 1) return
    setPayments((prev) => prev.filter((p) => p.id !== id))
  }

  const updatePayment = (id: string, field: keyof PaymentEntry, value: string) => {
    setPayments((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p))
  }

  const distributeRemainder = (id: string) => {
    setPayments((prev) => {
      const total = prev.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      const diff = estimatedTotal - total
      if (Math.abs(diff) < 0.01) return prev
      return prev.map((p) => p.id === id && !p.amount ? { ...p, amount: Math.max(0, diff).toFixed(2) } : p)
    })
  }

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return
    setIsValidatingCoupon(true)
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponInput.trim().toUpperCase(), tenantId: tenant.id, subtotal: subtotal() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Cupom inválido'); setCouponDiscount(0); setCouponDescription(''); return }
      setCoupon(couponInput.trim().toUpperCase())
      setCouponDiscount(data.discount ?? 0)
      setCouponDescription(data.description ?? '')
      toast.success(`Cupom aplicado! ${data.description}`)
    } catch { toast.error('Erro ao validar cupom') }
    finally { setIsValidatingCoupon(false) }
  }

  const handleSubmitOrder = async () => {
    if (items.length === 0) return
    if (!isTableOrder && !customerPhone && !phone) { toast.error('Informe seu telefone'); return }
    if (deliveryType === 'DELIVERY' && !cepZone && tenant.deliveryZones.length > 0) { toast.error('Informe um CEP válido na área de entrega'); return }

    // CORREÇÃO: endereço de entrega obrigatório
    if (deliveryType === 'DELIVERY' && !deliveryAddress.trim()) {
      toast.error('Informe o endereço completo para entrega')
      return
    }

    if (payments.some((p) => !p.amount || parseFloat(p.amount) <= 0)) {
      toast.error('Informe o valor de cada forma de pagamento')
      return
    }
    if (!isFullyAllocated) {
      const diff = estimatedTotal - totalAllocated
      if (diff > 0.01) {
        toast.error(`Faltam ${formatCurrency(diff)} para completar o pagamento`)
        return
      }
    }

    setIsSubmitting(true)
    try {
      const result = await createOrderAction({
        tenantId: tenant.id,
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, addonIds: i.addons.map((a) => a.id), notes: i.notes })),
        type: isTableOrder ? 'TABLE' : deliveryType === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
        tableId: tableId ?? undefined,
        couponCode: couponCode ?? undefined,
        cashbackToUse:  useCashback && cashbackToUse > 0 ? cashbackToUse : undefined,
        pointsToRedeem: usePoints && pointsToRedeem > 0 ? pointsToRedeem : undefined,
        deliveryBairro: deliveryBairro ?? undefined,
        deliveryAddress: deliveryAddress || undefined,
        customerPhone: isTableOrder ? (customerPhone || phone || undefined) : (customerPhone || phone),
        customerName: name || undefined,
        payments: payments.map((p) => ({
          method: p.method,
          amount: parseFloat(p.amount),
          changeFor: p.method === 'CASH' && p.changeFor ? Number(p.changeFor) : undefined,
        })),
        paymentMethod: payments[0].method,
        changeFor: payments[0].method === 'CASH' && payments[0].changeFor ? Number(payments[0].changeFor) : undefined,
      })

      if (result.error) { toast.error(result.error); return }
      clearCart(); onClose()
      toast.success('Pedido realizado! 🎉')
      router.push(`/menu/${tenant.slug}/pedido/${result.orderId}`)
    } catch { toast.error('Erro ao realizar pedido. Tente novamente.') }
    finally { setIsSubmitting(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="w-full max-w-sm bg-white dark:bg-gray-900 flex flex-col h-full shadow-2xl">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                <ShoppingBag className="w-4 h-4" style={{ color }} />
              </div>
              <h2 className="font-black text-gray-900 dark:text-gray-100 text-base">{STEP_LABELS[step]}</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          {!isTableOrder && (
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center flex-1">
                  <div className={cn('flex-1 h-1.5 rounded-full transition-all', i <= stepIndex ? 'opacity-100' : 'opacity-20')}
                    style={{ background: i <= stepIndex ? color : '#e5e7eb' }} />
                  {i < STEPS.length - 1 && <div className="w-1" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Carrinho ── */}
          {step === 'cart' && (
            <div className="p-5 space-y-3">
              {items.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4 text-2xl">🛒</div>
                  <p className="font-semibold text-gray-500">Seu carrinho está vazio</p>
                  <p className="text-sm mt-1 text-gray-400">Adicione algo delicioso!</p>
                </div>
              ) : (
                <>
                  {items.map((item) => (
                    <div key={item.cartItemId} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{item.productName}</p>
                        {item.addons.length > 0 && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.addons.map((a) => a.name).join(', ')}</p>}
                        {item.notes && <p className="text-xs text-gray-400 italic mt-0.5 truncate">"{item.notes}"</p>}
                        <p className="font-black text-sm mt-1" style={{ color }}>{formatCurrency(item.totalPrice)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <button onClick={() => removeItem(item.cartItemId)} className="text-gray-300 hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)} className="w-7 h-7 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:border-gray-300 transition-colors"><Minus className="h-3 w-3 text-gray-500" /></button>
                          <span className="text-sm font-bold w-5 text-center text-gray-900 dark:text-gray-100">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)} className="w-7 h-7 rounded-xl flex items-center justify-center text-white" style={{ background: color }}><Plus className="h-3 w-3" /></button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Cupom */}
                  <div className="pt-2">
                    <div className="flex gap-2">
                      <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Código do cupom"
                        className="flex-1 px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      <button onClick={handleApplyCoupon} disabled={isValidatingCoupon || !couponInput.trim()}
                        className="px-3 py-2.5 rounded-xl text-white text-sm font-bold transition-colors" style={{ background: color }}>
                        {isValidatingCoupon ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" /> : <Tag className="h-4 w-4" />}
                      </button>
                    </div>
                    {couponCode && (
                      <div className="flex items-center justify-between mt-2 px-1">
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          ✓ {couponCode}{couponDescription ? ` — ${couponDescription}` : ''}
                          {couponDiscount > 0 && <span className="ml-1 font-bold">(-{formatCurrency(couponDiscount)})</span>}
                        </span>
                        <button onClick={() => { setCoupon(null); setCouponInput(''); setCouponDiscount(0); setCouponDescription('') }} className="text-xs text-red-400 hover:text-red-500">Remover</button>
                      </div>
                    )}
                  </div>

                  {/* Cashback — só mostra se o cliente estiver identificado e tiver saldo */}
                  {cashbackBalance > 0 && (
                    <div className="pt-2">
                      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                              💰 Cashback disponível
                            </p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
                              Saldo: <strong>{formatCurrency(cashbackBalance)}</strong>
                            </p>
                          </div>
                          {/* Toggle */}
                          <button
                            onClick={() => {
                              const next = !useCashback
                              setUseCashback(next)
                              if (next) {
                                // Usar o menor entre saldo disponível e total do pedido
                                const max = Math.min(cashbackBalance, subtotal() + deliveryFee - couponDiscount)
                                setCashbackToUse(Math.floor(max * 100) / 100)
                              } else {
                                setCashbackToUse(0)
                              }
                            }}
                            className={`relative w-11 h-6 rounded-full transition-colors ${useCashback ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${useCashback ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {useCashback && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-emerald-600 dark:text-emerald-400">Usando: <strong>{formatCurrency(cashbackToUse)}</strong></span>
                              <span className="text-xs text-emerald-600 dark:text-emerald-400">Máx: {formatCurrency(Math.min(cashbackBalance, subtotal() + deliveryFee - couponDiscount))}</span>
                            </div>
                            <input
                              type="range" min={0}
                              max={Math.min(cashbackBalance, subtotal() + deliveryFee - couponDiscount)}
                              step={0.01}
                              value={cashbackToUse}
                              onChange={(e) => setCashbackToUse(Number(e.target.value))}
                              className="w-full accent-emerald-500"
                            />
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 text-center font-medium">
                              -({formatCurrency(cashbackToUse)}) no total
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Pontos de fidelidade — resgate configurável pelo lojista */}
                  {loyaltyPoints > 0 && loyaltyConfig && loyaltyPoints >= loyaltyConfig.minPointsRedeem && (
                    <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                            ⭐ Usar pontos de fidelidade
                          </p>
                          <p className="text-xs text-amber-600/80 mt-0.5">
                            Você tem <strong>{loyaltyPoints} pts</strong> · A cada {loyaltyConfig.redeemEvery} pts = {formatCurrency(loyaltyConfig.redeemValue)}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const next = !usePoints
                            setUsePoints(next)
                            if (next) {
                              // Máximo de pontos que pode usar sem negativar o pedido
                              const maxDiscount = subtotal() + deliveryFee - couponDiscount - (useCashback ? cashbackToUse : 0)
                              const maxBlocks   = Math.floor(maxDiscount / loyaltyConfig.redeemValue)
                              const available   = Math.floor(loyaltyPoints / loyaltyConfig.redeemEvery)
                              const blocks      = Math.min(maxBlocks, available)
                              setPointsToRedeem(blocks * loyaltyConfig.redeemEvery)
                            } else {
                              setPointsToRedeem(0)
                            }
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors ${usePoints ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${usePoints ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      {usePoints && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              Usando: <strong>{pointsToRedeem} pts</strong> = <strong>{formatCurrency(pointsDiscount)}</strong>
                            </span>
                            <span className="text-xs text-amber-600/80">
                              Restam: {loyaltyPoints - pointsToRedeem} pts
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={Math.floor(loyaltyPoints / loyaltyConfig.redeemEvery) * loyaltyConfig.redeemEvery}
                            step={loyaltyConfig.redeemEvery}
                            value={pointsToRedeem}
                            onChange={(e) => setPointsToRedeem(Number(e.target.value))}
                            className="w-full accent-amber-500"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tipo de entrega */}
                  {!isTableOrder && (
                    <div className="pt-2">
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Como deseja receber?</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['DELIVERY', 'PICKUP'] as const).map((type) => (
                          <button key={type} onClick={() => setDeliveryType(type)}
                            className={cn('py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-1.5',
                              deliveryType === type ? 'text-white border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300')}
                            style={deliveryType === type ? { background: color, borderColor: color } : {}}>
                            {type === 'DELIVERY' ? <><Truck className="w-4 h-4" /> Entrega</> : <><Store className="w-4 h-4" /> Retirada</>}
                          </button>
                        ))}
                      </div>
                      {deliveryType === 'DELIVERY' && (
                        <div className="mt-3 space-y-2">
                          {/* CEP first — busca zona automaticamente */}
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={cep}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                                const fmt = v.length > 5 ? `${v.slice(0,5)}-${v.slice(5)}` : v
                                handleCepLookup(fmt)
                              }}
                              placeholder="Digite seu CEP *"
                              maxLength={9}
                              className={cn(
                                'w-full pl-9 pr-10 py-2.5 text-sm border rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-orange-500',
                                cepError ? 'border-red-400 dark:border-red-600' : cepZone ? 'border-green-400 dark:border-green-600' : 'border-gray-200 dark:border-gray-700'
                              )}
                            />
                            {cepLoading && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
                            )}
                          </div>
                          {cepError && <p className="text-xs text-red-500">{cepError}</p>}
                          {cepZone && (
                            <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                              ✓ Entrega disponível — {cepZone.name ?? cepZone.bairro} · {cepZone.freeAbove && subtotal() >= cepZone.freeAbove ? 'Frete grátis 🎉' : formatCurrency(cepZone.fee)}
                            </div>
                          )}
                          {/* Endereço preenchido automaticamente ou manualmente */}
                          <div className="relative">
                            <input
                              type="text"
                              value={deliveryAddress}
                              onChange={(e) => setDeliveryAddress(e.target.value)}
                              placeholder="Rua, número, complemento *"
                              className={cn(
                                'w-full px-3 py-2.5 text-sm border rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-orange-500',
                                !deliveryAddress.trim() ? 'border-orange-300 dark:border-orange-700' : 'border-gray-200 dark:border-gray-700'
                              )}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Dados do cliente ── */}
          {step === 'info' && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Telefone (WhatsApp) *</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <p className="text-xs text-gray-400 mt-1.5">Você receberá atualizações do pedido via WhatsApp</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Seu nome (opcional)</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="João Silva"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
            </div>
          )}

          {/* ── Pagamento ── */}
          {step === 'payment' && (
            <div className="p-5 space-y-4">
              {isTableOrder && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    Telefone (opcional, para atualizações via WhatsApp)
                  </label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999"
                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              )}

              {/* Formas de Pagamento Múltiplas */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Formas de pagamento</p>
                  {payments.length < 4 && (
                    <button onClick={addPayment}
                      className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors text-white"
                      style={{ background: color }}>
                      <PlusCircle className="w-3.5 h-3.5" /> Dividir
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {payments.map((entry, idx) => (
                    <div key={entry.id} className="border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {payments.length > 1 ? `Pagamento ${idx + 1}` : 'Forma de pagamento'}
                        </span>
                        {payments.length > 1 && (
                          <button onClick={() => removePayment(entry.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                            <MinusCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* CORREÇÃO: grid 2x2 para caber crédito e débito separados */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {PAYMENT_OPTIONS.map((opt) => (
                          <button key={opt.value} onClick={() => updatePayment(entry.id, 'method', opt.value)}
                            className={cn('py-2.5 px-2 rounded-xl text-xs font-bold border-2 text-center transition-all',
                              entry.method === opt.value ? 'text-white border-transparent' : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-200')}
                            style={entry.method === opt.value ? { background: color, borderColor: color } : {}}>
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Valor */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={entry.amount}
                            onChange={(e) => updatePayment(entry.id, 'amount', e.target.value)}
                            onFocus={() => distributeRemainder(entry.id)}
                            placeholder={payments.length > 1 ? 'Valor' : estimatedTotal.toFixed(2)}
                            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                        {payments.length > 1 && remaining > 0.01 && !entry.amount && (
                          <button
                            onClick={() => updatePayment(entry.id, 'amount', remaining.toFixed(2))}
                            className="text-xs px-2.5 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400 transition-colors whitespace-nowrap">
                            +{formatCurrency(remaining)}
                          </button>
                        )}
                      </div>

                      {entry.method === 'CASH' && (
                        <div>
                          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Troco para quanto?</label>
                          <input type="number" value={entry.changeFor} onChange={(e) => updatePayment(entry.id, 'changeFor', e.target.value)}
                            placeholder="Ex: 50.00"
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-orange-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {payments.length > 1 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-gray-500">Alocado</span>
                      <span className={cn(isFullyAllocated ? 'text-emerald-600' : totalAllocated > estimatedTotal ? 'text-red-500' : 'text-amber-500')}>
                        {formatCurrency(totalAllocated)} / {formatCurrency(estimatedTotal)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', isFullyAllocated ? 'bg-emerald-500' : totalAllocated > estimatedTotal ? 'bg-red-400' : 'bg-amber-400')}
                        style={{ width: `${Math.min(100, (totalAllocated / estimatedTotal) * 100)}%` }} />
                    </div>
                    {!isFullyAllocated && remaining > 0.01 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Falta alocar {formatCurrency(remaining)}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Resumo */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 space-y-2.5">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span><span>{formatCurrency(subtotal())}</span>
                </div>
                {deliveryType === 'DELIVERY' && (
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>Entrega</span><span>{deliveryFee === 0 ? '🎉 Grátis' : formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                {couponCode && couponDiscount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>🏷 Cupom {couponCode}</span><span>-{formatCurrency(couponDiscount)}</span>
                  </div>
                )}
                {useCashback && cashbackToUse > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>💰 Cashback</span><span>-{formatCurrency(cashbackToUse)}</span>
                  </div>
                )}
                {usePoints && pointsDiscount > 0 && (
                  <div className="flex justify-between text-sm text-amber-600 dark:text-amber-400 font-semibold">
                    <span>⭐ Pontos ({pointsToRedeem} pts)</span><span>-{formatCurrency(pointsDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-gray-900 dark:text-gray-100 border-t border-gray-200 dark:border-gray-700 pt-2.5">
                  <span>Total estimado</span>
                  <span style={{ color }}>{formatCurrency(estimatedTotal)}</span>
                </div>
                <p className="text-[10px] text-gray-400 text-center">* Valor final confirmado pelo servidor</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
            {step === 'cart' && (
              <button onClick={() => {
                // Validate address before proceeding
                if (deliveryType === 'DELIVERY' && !cepZone && tenant.deliveryZones.length > 0) {
                  toast.error('Informe um CEP válido na área de entrega')
                  return
                }
                if (deliveryType === 'DELIVERY' && !deliveryAddress.trim()) {
                  toast.error('Informe o endereço completo antes de continuar')
                  return
                }
                setStep(isTableOrder ? 'payment' : 'info')
              }}
                className="w-full flex items-center justify-between text-white px-5 py-3.5 rounded-2xl font-bold transition-all active:scale-95"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
                <span>Continuar</span>
                <div className="flex items-center gap-2">
                  <span>{formatCurrency(estimatedTotal)}</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            )}
            {step === 'info' && (
              <div className="flex gap-2">
                <button onClick={() => setStep('cart')} className="px-4 py-3.5 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 transition-colors">Voltar</button>
                <button
                  onClick={() => {
                    if (!phone && !customerPhone) { toast.error('Informe seu telefone'); return }
                    setCustomer(phone || customerPhone!, name)
                    setStep('payment')
                  }}
                  className="flex-1 text-white py-3.5 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
                  Continuar <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {step === 'payment' && (
              <div className="flex gap-2">
                <button onClick={() => setStep(isTableOrder ? 'cart' : 'info')} className="px-4 py-3.5 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 transition-colors">Voltar</button>
                <button
                  onClick={handleSubmitOrder}
                  disabled={isSubmitting}
                  className="flex-1 text-white py-3.5 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
                  {isSubmitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                  ) : (
                    <>Fazer pedido · {formatCurrency(estimatedTotal)}</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
