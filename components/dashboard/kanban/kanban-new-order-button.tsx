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
  categories: Category[]
}

interface OrderItem {
  productId: string
  productName: string
  price: number
  quantity: number
}

export function KanbanNewOrderButton({ tenantId, categories }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<OrderItem[]>([])
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CASH' | 'CARD'>('PIX')
  const [notes, setNotes] = useState('')
  const [isPending, start] = useTransition()
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

  const handleSubmit = () => {
    if (items.length === 0) { toast.error('Adicione pelo menos um item'); return }
    start(async () => {
      try {
        const result = await createOrderAction({
          tenantId,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, addonIds: [] })),
          type: 'PDV',
          customerPhone: customerPhone || undefined,
          customerName: customerName || undefined,
          paymentMethod,
          notes: notes || undefined,
        })
        if (result.error) { toast.error(result.error); return }
        toast.success('Pedido criado! 🎉')
        setOpen(false)
        setItems([]); setCustomerPhone(''); setCustomerName(''); setNotes('')
        router.refresh()
      } catch {
        toast.error('Erro ao criar pedido')
      }
    })
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

              {/* Pagamento */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-2">Forma de pagamento</label>
                <div className="flex gap-2">
                  {(['PIX', 'CASH', 'CARD'] as const).map((m) => (
                    <button key={m} onClick={() => setPaymentMethod(m)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                        paymentMethod === m ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:border-primary/50'
                      }`}>
                      {m === 'PIX' ? '⚡ PIX' : m === 'CASH' ? '💵 Dinheiro' : '💳 Cartão'}
                    </button>
                  ))}
                </div>
              </div>

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
          </div>
        </div>
      )}
    </>
  )
}
