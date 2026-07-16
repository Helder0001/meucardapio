'use client'

// components/dashboard/stock-manager.tsx

import { useState, useTransition, useActionState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Package, Plus, AlertTriangle, X, ArrowDownCircle, ArrowUpCircle,
  Pencil, History,
} from 'lucide-react'
import Image from 'next/image'
import { createStockAction, type StockFormState } from '@/actions/stock/create-stock'
import { adjustStockAction, type AdjustStockState } from '@/actions/stock/adjust-stock'
import { updateMinQuantityAction } from '@/actions/stock/update-min-quantity'

interface StockRow {
  id: string
  quantity: number
  minQuantity: number | null
  unit: string
  updatedAt: Date
  product: { id: string; name: string; image: string | null; isActive: boolean }
  pdv: { id: string; name: string }
}

interface StockManagerProps {
  stocks: StockRow[]
  products: Array<{ id: string; name: string }>
}

function stockStatus(stock: StockRow): 'out' | 'low' | 'ok' {
  if (stock.quantity <= 0) return 'out'
  if (stock.minQuantity !== null && stock.quantity <= stock.minQuantity) return 'low'
  return 'ok'
}

export function StockManager({ stocks, products }: StockManagerProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<StockRow | null>(null)
  const [minEditTarget, setMinEditTarget] = useState<StockRow | null>(null)

  const productsWithoutStock = products.filter(
    (p) => !stocks.some((s) => s.product.id === p.id)
  )

  const filtered = stocks.filter((s) => {
    if (search && !s.product.name.toLowerCase().includes(search.toLowerCase())) return false
    const status = stockStatus(s)
    if (filter === 'low' && status !== 'low') return false
    if (filter === 'out' && status !== 'out') return false
    return true
  })

  const counts = {
    low: stocks.filter((s) => stockStatus(s) === 'low').length,
    out: stocks.filter((s) => stockStatus(s) === 'out').length,
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 text-sm border border-input rounded-lg bg-card w-48 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {([
            { key: 'all', label: 'Todos' },
            { key: 'low', label: `Estoque baixo${counts.low ? ` (${counts.low})` : ''}` },
            { key: 'out', label: `Esgotados${counts.out ? ` (${counts.out})` : ''}` },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filter === f.key
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          disabled={productsWithoutStock.length === 0 && products.length > 0}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium text-sm rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={productsWithoutStock.length === 0 ? 'Todos os produtos já têm estoque cadastrado' : undefined}
        >
          <Plus className="h-4 w-4" />
          Cadastrar estoque
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 font-medium text-right">Quantidade</th>
              <th className="px-4 py-3 font-medium text-right">Alerta mínimo</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((stock) => {
              const status = stockStatus(stock)
              return (
                <tr key={stock.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-8 h-8 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                        {stock.product.image ? (
                          <Image src={stock.product.image} alt={stock.product.name} fill className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm">🍽️</div>
                        )}
                      </div>
                      <span className={cn('font-medium text-foreground', !stock.product.isActive && 'opacity-50')}>
                        {stock.product.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">
                    {stock.quantity} {stock.unit}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setMinEditTarget(stock)}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                    >
                      {stock.minQuantity ?? '—'}
                      <Pencil className="h-3 w-3" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {status === 'out' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-destructive/10 text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Esgotado
                      </span>
                    )}
                    {status === 'low' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> Baixo
                      </span>
                    )}
                    {status === 'ok' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        Em estoque
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setAdjustTarget(stock)}
                      className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      Ajustar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {stocks.length === 0
                ? 'Nenhum produto com estoque cadastrado ainda'
                : 'Nenhum item encontrado para esse filtro'}
            </p>
            {stocks.length === 0 && (
              <p className="text-xs mt-1">
                Produtos sem estoque cadastrado são vendidos sem limite de quantidade.
              </p>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateStockModal
          products={productsWithoutStock}
          onClose={() => setShowCreate(false)}
        />
      )}

      {adjustTarget && (
        <AdjustStockModal stock={adjustTarget} onClose={() => setAdjustTarget(null)} />
      )}

      {minEditTarget && (
        <MinQuantityModal stock={minEditTarget} onClose={() => setMinEditTarget(null)} />
      )}
    </div>
  )
}

// ── Modal: cadastrar novo controle de estoque ─────────────────────────────

function CreateStockModal({
  products, onClose,
}: {
  products: Array<{ id: string; name: string }>
  onClose: () => void
}) {
  const [state, formAction, isPending] = useActionState<StockFormState, FormData>(
    createStockAction,
    {}
  )

  useEffect(() => {
    if (state.ok) {
      toast.success('Estoque cadastrado com sucesso!')
      onClose()
    }
  }, [state.ok])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground text-lg">Cadastrar estoque</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todos os produtos ativos já têm estoque cadastrado.
          </p>
        ) : (
          <form action={formAction} className="space-y-3">
            {state.error && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{state.error}</p>
            )}

            <div>
              <label className="text-xs font-medium text-foreground">Produto</label>
              <select name="productId" required className="w-full mt-1 px-3 py-2 text-sm border border-input rounded-lg bg-background">
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Quantidade inicial</label>
                <input
                  name="quantity" type="number" min={0} step="0.001" defaultValue={0} required
                  className="w-full mt-1 px-3 py-2 text-sm border border-input rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Unidade</label>
                <input
                  name="unit" defaultValue="UN" maxLength={10}
                  className="w-full mt-1 px-3 py-2 text-sm border border-input rounded-lg bg-background"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Alerta de estoque baixo (opcional)</label>
              <input
                name="minQuantity" type="number" min={0} step="0.001"
                placeholder="Ex: 5"
                className="w-full mt-1 px-3 py-2 text-sm border border-input rounded-lg bg-background"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isPending ? 'Salvando...' : 'Cadastrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Modal: ajustar quantidade (entrada/saída/correção) ────────────────────

function AdjustStockModal({ stock, onClose }: { stock: StockRow; onClose: () => void }) {
  const [type, setType] = useState<'MANUAL_IN' | 'MANUAL_OUT' | 'ADJUSTMENT'>('MANUAL_IN')
  const [state, formAction, isPending] = useActionState<AdjustStockState, FormData>(
    adjustStockAction,
    {}
  )

  useEffect(() => {
    if (state.ok) {
      toast.success('Estoque atualizado!')
      onClose()
    }
  }, [state.ok])

  const typeOptions = [
    { key: 'MANUAL_IN' as const, label: 'Entrada', icon: ArrowUpCircle, hint: 'Compra, reposição' },
    { key: 'MANUAL_OUT' as const, label: 'Saída', icon: ArrowDownCircle, hint: 'Perda, quebra, validade' },
    { key: 'ADJUSTMENT' as const, label: 'Corrigir', icon: History, hint: 'Definir valor exato (inventário)' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-foreground text-lg">Ajustar estoque</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {stock.product.name} · saldo atual: <strong className="text-foreground">{stock.quantity} {stock.unit}</strong>
        </p>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="stockId" value={stock.id} />
          <input type="hidden" name="type" value={type} />

          {state.error && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{state.error}</p>
          )}

          <div className="grid grid-cols-3 gap-2">
            {typeOptions.map((opt) => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setType(opt.key)}
                  className={cn(
                    'flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-xs font-medium transition-colors',
                    type === opt.key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            {typeOptions.find((o) => o.key === type)?.hint}
          </p>

          <div>
            <label className="text-xs font-medium text-foreground">
              {type === 'ADJUSTMENT' ? 'Novo saldo total' : 'Quantidade'}
            </label>
            <input
              name="quantity" type="number" min={0} step="0.001" required autoFocus
              className="w-full mt-1 px-3 py-2 text-sm border border-input rounded-lg bg-background"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">Motivo (opcional)</label>
            <input
              name="reason" maxLength={200} placeholder="Ex: Compra de fornecedor X"
              className="w-full mt-1 px-3 py-2 text-sm border border-input rounded-lg bg-background"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {isPending ? 'Salvando...' : 'Confirmar ajuste'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Modal: editar alerta de estoque mínimo ─────────────────────────────────

function MinQuantityModal({ stock, onClose }: { stock: StockRow; onClose: () => void }) {
  const [value, setValue] = useState(stock.minQuantity?.toString() ?? '')
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    startTransition(async () => {
      const minQuantity = value.trim() === '' ? null : Number(value)
      const result = await updateMinQuantityAction({ stockId: stock.id, minQuantity })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Alerta de estoque baixo atualizado')
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs bg-card border border-border rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-foreground text-base">Alerta de estoque baixo</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Você será notificado quando "{stock.product.name}" atingir essa quantidade ou menos. Deixe vazio para desativar o alerta.
        </p>
        <input
          type="number" min={0} step="0.001" value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Sem alerta"
          autoFocus
          className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background mb-3"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="w-full px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isPending ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
