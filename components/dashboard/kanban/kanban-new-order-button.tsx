'use client'
// components/dashboard/kanban/kanban-new-order-button.tsx
// Botão "Novo Pedido" com modal para criar pedido manual no balcão/PDV

import { useState, useTransition } from 'react'
import { Plus, X, Loader2, Minus, ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { createOrderAction } from '@/actions/orders/create-order'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Product { id: string; name: string; price: number }
interface Category { id: string; name: string; products: Product[] }

interface Props {
  tenantId: string
  pdvId?: string
  createdByUserId?: string
  categories: Category[]
}

interface OrderItem {
  productId: string
  productName: string
  price: number
  quantity: number
}

type PaymentMethodType = 'PIX' | 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD'
interface PaymentEntry { method: PaymentMethodType; amount: number }

interface PixData { qrCode: string; qrCodeBase64: string }

export function KanbanNewOrderButton({ tenantId, pdvId, createdByUserId, categories }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<OrderItem[]>([])
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  // CORREÇÃO: suporta múltiplas formas de pagamento no mesmo pedido (split)
  const [payments, setPayments] = useState<PaymentEntry[]>([{ method: 'PIX', amount: 0 }])
  const [notes, setNotes] = useState('')
  const [payNow, setPayNow] = useState(true)   // pagar agora ou deixar pendente (pagar no final)
  const [isPending, start] = useTransition()
  const [pixData, setPixData] = useState<PixData | null>(null)
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  const addItem = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { productId: product.id, productName: product.name, price: product.price, quantity: 1 }]
    })
  }

  const updateQty = (productId: string, delta: number) => {
    setItems((prev) => {
      const next = prev.map((i) => i.productId === productId ? { ...i, quantity: i.quantity + delta } : i)
      return next.filter((i) => i.quantity > 0)
    })
  }

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0)

  // ── Split de pagamento ───────────────────────────────────────────────────
  const paidSum   = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const remaining = Math.round((total - paidSum) * 100) / 100

  const addPaymentRow = () => {
    setPayments((prev) => [...prev, { method: 'CASH', amount: Math.max(remaining, 0) }])
  }
  const removePaymentRow = (idx: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== idx))
  }
  const updatePaymentMethod = (idx: number, method: PaymentMethodType) => {
    setPayments((prev) => prev.map((p, i) => i === idx ? { ...p, method } : p))
  }
  const updatePaymentAmount = (idx: number, amount: number) => {
    setPayments((prev) => prev.map((p, i) => i === idx ? { ...p, amount } : p))
  }

  const handleSubmit = () => {
    if (items.length === 0) { toast.error('Adicione pelo menos um item'); return }
    // Com 1 só forma de pagamento, o valor é sempre o total do pedido.
    // Com mais de uma (split), as parcelas precisam somar exatamente o total.
    const finalPayments: PaymentEntry[] = payments.length === 1
      ? [{ ...payments[0], amount: total }]
      : payments
    if (payments.length > 1 && Math.abs(remaining) > 0.01) {
      toast.error(remaining > 0
        ? `Faltam ${formatCurrency(remaining)} para completar o pagamento`
        : `Os valores excedem o total em ${formatCurrency(-remaining)}`)
      return
    }
    start(async () => {
      try {
        const result = await createOrderAction({
          tenantId,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, addonIds: [] })),
          type: 'PDV',
          pdvId,
          createdByUserId,
          customerPhone: customerPhone || undefined,
          customerName: customerName || undefined,
          payments: payNow ? finalPayments : undefined,
          notes: notes || undefined,
        })
        if (result.error) { toast.error(result.error); return }

        // Se algum dos pagamentos for PIX, mostrar QR code + copia-e-cola
        // em vez de fechar direto — o caixa precisa exibir isso pro cliente.
        if (result.paymentData?.pixQrCode && result.paymentData?.pixQrCodeBase64) {
          setPixData({ qrCode: result.paymentData.pixQrCode, qrCodeBase64: result.paymentData.pixQrCodeBase64 })
          toast.success('Pedido criado! Aguardando pagamento PIX')
          router.refresh()
          return
        }

        toast.success('Pedido criado! 🎉')
        closeAndReset()
        router.refresh()
      } catch {
        toast.error('Erro ao criar pedido')
      }
    })
  }

  const closeAndReset = () => {
    setOpen(false)
    setItems([]); setCustomerPhone(''); setCustomerName(''); setNotes('')
    setPayments([{ method: 'PIX', amount: 0 }])
    setPayNow(true)
    setPixData(null); setCopied(false)
  }

  const copyPixCode = async () => {
    if (!pixData) return
    try {
      await navigator.clipboard.writeText(pixData.qrCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Novo pedido
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-primary" />
                <h2 className="font-bold text-foreground">Novo Pedido (Balcão / PDV)</h2>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {pixData ? (
              <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center gap-4">
                <div>
                  <h3 className="font-bold text-foreground">Aguardando pagamento PIX</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Peça pro cliente escanear o QR Code ou usar o código copia e cola. Expira em 5 minutos.
                  </p>
                </div>
                <img
                  src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-56 h-56 rounded-xl border border-border"
                />
                <div className="w-full">
                  <p className="text-xs font-medium text-foreground mb-1 text-left">Código copia e cola</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={pixData.qrCode}
                      className="flex-1 px-3 py-2 text-xs border border-input rounded-lg bg-muted truncate" />
                    <button onClick={copyPixCode}
                      className="px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex-shrink-0">
                      {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
                <button onClick={closeAndReset}
                  className="w-full mt-2 px-4 py-3 bg-muted text-foreground font-semibold rounded-lg hover:bg-muted/70 transition-colors">
                  Concluir
                </button>
              </div>
            ) : (
              <>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Produtos */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-3">Selecionar produtos</p>
                <div className="space-y-3">
                  {categories.map((cat) => (
                    <div key={cat.id}>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{cat.name}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {cat.products.map((product) => {
                          const item = items.find((i) => i.productId === product.id)
                          return (
                            <div key={product.id} className="flex items-center justify-between p-2.5 bg-muted rounded-lg">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-foreground truncate">{product.name}</p>
                                <p className="text-xs text-primary font-bold">{formatCurrency(product.price)}</p>
                              </div>
                              {item ? (
                                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                                  <button onClick={() => updateQty(product.id, -1)} className="w-6 h-6 rounded-md bg-background border border-border flex items-center justify-center">
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                                  <button onClick={() => updateQty(product.id, 1)} className="w-6 h-6 rounded-md bg-primary text-white flex items-center justify-center">
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => addItem(product)} className="w-6 h-6 rounded-md bg-primary text-white flex items-center justify-center ml-2 flex-shrink-0">
                                  <Plus className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dados do cliente */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Telefone (opcional)</label>
                  <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(11) 99999-9999"
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Nome (opcional)</label>
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente"
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>

              {/* Quando pagar — pagar agora ou deixar para o final */}
              <div className="flex items-center justify-between rounded-xl border border-border p-3 bg-muted/30">
                <div>
                  <p className="text-xs font-semibold text-foreground">Cobrar agora?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {payNow ? 'Pagamento registrado na criação do pedido' : 'Pedido fica pendente — cobra no final'}
                  </p>
                </div>
                <button
                  onClick={() => setPayNow((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${payNow ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${payNow ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Forma de pagamento — só aparece se cobrar agora */}
              {payNow && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-foreground">Forma de pagamento</label>
                    {payments.length === 1 && (
                      <button onClick={addPaymentRow} className="text-xs font-medium text-primary hover:underline">
                        + Dividir pagamento
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {payments.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={p.method}
                          onChange={(e) => updatePaymentMethod(idx, e.target.value as PaymentMethodType)}
                          className="flex-1 px-2.5 py-2 text-xs font-medium border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="PIX">⚡ PIX</option>
                          <option value="CASH">💵 Dinheiro</option>
                          <option value="CREDIT_CARD">💳 Crédito</option>
                          <option value="DEBIT_CARD">💳 Débito</option>
                        </select>

                        {payments.length > 1 && (
                          <input
                            type="number" min="0" step="0.01"
                            value={p.amount || ''}
                            onChange={(e) => updatePaymentAmount(idx, Number(e.target.value))}
                            placeholder="0,00"
                            className="w-24 px-2.5 py-2 text-xs border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        )}

                        {payments.length > 1 && (
                          <button onClick={() => removePaymentRow(idx)} className="w-7 h-7 flex-shrink-0 rounded-md bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {payments.length > 1 && (
                    <div className="flex justify-between text-xs mt-2">
                      <button onClick={addPaymentRow} className="font-medium text-primary hover:underline">
                        + Adicionar outra forma
                      </button>
                      <span className={remaining === 0 ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                        {remaining > 0
                          ? `Faltam ${formatCurrency(remaining)}`
                          : remaining < 0
                            ? `Excede em ${formatCurrency(-remaining)}`
                            : 'Valores OK ✓'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Observações */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Observações (opcional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observações gerais do pedido..."
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-border">
              {items.length > 0 && (
                <div className="mb-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Resumo do pedido</p>
                  {items.map((i) => (
                    <div key={i.productId} className="flex justify-between text-xs text-foreground">
                      <span>{i.quantity}x {i.productName}</span>
                      <span className="font-medium">{formatCurrency(i.price * i.quantity)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(total)}</span>
                  </div>
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={isPending || items.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isPending ? 'Criando...' : `Criar pedido${total > 0 ? ` · ${formatCurrency(total)}` : ''}`}
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
