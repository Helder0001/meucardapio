'use client'

// components/dashboard/customers/customer-detail-drawer.tsx
//
// Painel de detalhe do cliente: Informações + Estatísticas por período +
// Tags automáticas + Histórico de pedidos. Abre ao clicar numa linha da
// tabela de clientes (ver customers-table.tsx).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate, formatPhone } from '@/lib/utils/format'
import {
  X, User, Phone, MapPin, Pencil, Trash2, TrendingUp, Flame,
  Package, Clock, Loader2, CheckCircle2, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CustomerDetail {
  id: string
  name: string | null
  phone: string
  email: string | null
  address: string | null
  isVerified: boolean
  createdAt: string
  loyaltyPoints: number
  cashbackBalance: number
}

interface Stats {
  week: { count: number; total: number }
  fortnight: { count: number; total: number }
  month: { count: number; total: number }
  total: { count: number; total: number }
}

interface Tag { key: string; label: string; description: string }

interface HistoryOrder {
  id: string
  orderNumber: number
  typeLabel: string
  status: string
  paymentStatus: string
  total: number
  createdAt: string
}

interface DetailResponse {
  customer: CustomerDetail
  stats: Stats
  tags: Tag[]
  history: HistoryOrder[]
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu p/ entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
}

export function CustomerDetailDrawer({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const router = useRouter()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', address: '' })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/customers/${customerId}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((json: DetailResponse) => {
        if (cancelled) return
        setData(json)
        setForm({
          name: json.customer.name ?? '',
          phone: json.customer.phone ?? '',
          address: json.customer.address ?? '',
        })
      })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar os dados do cliente.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [customerId])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Não foi possível salvar.')
        return
      }
      setData((d) => d ? { ...d, customer: { ...d.customer, ...form } } : d)
      setEditing(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!confirm('Remover este cliente? Os dados pessoais serão anonimizados (LGPD) — o histórico de pedidos continua existindo, mas sem identificar o cliente. Essa ação não pode ser desfeita.')) return
    setRemoving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? 'Não foi possível remover o cliente.')
        return
      }
      router.refresh()
      onClose()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-background border-l border-border shadow-xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-background border-b border-border">
          <h2 className="font-bold text-foreground">Cliente</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !data ? (
          <div className="p-5 text-sm text-destructive">{error ?? 'Cliente não encontrado.'}</div>
        ) : (
          <div className="p-5 space-y-5">
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
                {error}
              </div>
            )}

            {/* Informações */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                  <User className="h-4 w-4" /> Informações
                </h3>
                {!editing && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditing(true)}
                      className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                    <button
                      onClick={handleRemove}
                      disabled={removing}
                      className="text-xs font-medium text-destructive hover:underline flex items-center gap-1 disabled:opacity-50"
                    >
                      {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      Remover
                    </button>
                  </div>
                )}
              </div>

              {editing ? (
                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Nome</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Telefone</label>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Endereço</label>
                    <input
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center gap-1.5"
                    >
                      {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                      Salvar
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false)
                        setForm({ name: data.customer.name ?? '', phone: data.customer.phone, address: data.customer.address ?? '' })
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-foreground">
                    <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    {data.customer.name ?? '—'}
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    {formatPhone(data.customer.phone)}
                    {data.customer.isVerified && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  </div>
                  <div className="flex items-start gap-2 text-foreground">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    {data.customer.address ?? '—'}
                  </div>
                </div>
              )}
            </div>

            {/* Estatísticas */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" /> Estatísticas
              </h3>
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Package className="h-3.5 w-3.5" /> PEDIDOS CONCLUÍDOS
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">No mês:</span>
                <span className="text-right font-medium text-foreground">{data.stats.month.count}</span>
                <span className="text-muted-foreground">No mês:</span>
                <span className="text-right font-semibold text-foreground">{formatCurrency(data.stats.month.total)}</span>

                <span className="text-muted-foreground">Na quinzena:</span>
                <span className="text-right font-medium text-foreground">{data.stats.fortnight.count}</span>
                <span className="text-muted-foreground">Na quinzena:</span>
                <span className="text-right font-semibold text-foreground">{formatCurrency(data.stats.fortnight.total)}</span>

                <span className="text-muted-foreground">Na semana:</span>
                <span className="text-right font-medium text-foreground">{data.stats.week.count}</span>
                <span className="text-muted-foreground">Na semana:</span>
                <span className="text-right font-semibold text-foreground">{formatCurrency(data.stats.week.total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 pt-2 border-t border-border text-sm">
                <span className="text-muted-foreground">Total:</span>
                <span className="text-right font-bold text-primary">{data.stats.total.count}</span>
                <span className="text-muted-foreground">Total gasto:</span>
                <span className="text-right font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(data.stats.total.total)}</span>
              </div>
            </div>

            {/* Tags automáticas */}
            {data.tags.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-orange-500" /> Tags automáticas
                </h3>
                <div className="space-y-2">
                  {data.tags.map((t) => (
                    <div key={t.key} className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5">
                      <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Histórico */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Histórico
              </h3>
              {data.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>
              ) : (
                <div className="space-y-1">
                  {data.history.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => router.push(`/dashboard/orders/${o.id}`)}
                      className="w-full flex items-center justify-between gap-2 py-2 border-b border-border last:border-0 hover:bg-muted/40 rounded-lg px-1.5 -mx-1.5 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className={cn(
                          'h-4 w-4 flex-shrink-0',
                          o.status === 'DELIVERED' ? 'text-emerald-500' : o.status === 'CANCELLED' ? 'text-destructive' : 'text-muted-foreground'
                        )} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            Pedido #{o.orderNumber} <span className="text-xs text-muted-foreground font-normal">{o.typeLabel}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">{STATUS_LABEL[o.status] ?? o.status}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(o.total)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
