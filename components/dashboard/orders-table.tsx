'use client'

// components/dashboard/orders-table.tsx

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDate, formatOrderNumber } from '@/lib/utils/format'
import { OrderStatusBadge } from './order-status-badge'
import { cn } from '@/lib/utils'
import { Search, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useState } from 'react'

interface Order {
  id: string
  orderNumber: number
  status: string
  paymentStatus: string
  type: string
  total: number
  createdAt: Date
  deliveryBairro: string | null
  customer: { name: string | null; phone: string } | null
  table: { number: number } | null
  waiter: { name: string } | null
  pdv: { name: string } | null
  payments?: Array<{ method: string }>
  _count: { items: number }
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'PENDING',           label: 'Pendente' },
  { value: 'CONFIRMED',         label: 'Confirmado' },
  { value: 'PREPARING',         label: 'Preparando' },
  { value: 'READY',             label: 'Pronto' },
  { value: 'OUT_FOR_DELIVERY',  label: 'Saiu p/ entrega' },
  { value: 'DELIVERED',         label: 'Entregue' },
  { value: 'CANCELLED',         label: 'Cancelado' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'Todos os tipos' },
  { value: 'DELIVERY', label: '🛵 Delivery' },
  { value: 'TABLE',    label: '🍽️ Mesa' },
  { value: 'PICKUP',   label: '🏪 Retirada' },
  { value: 'PDV',      label: '💳 Balcão' },
]

// NOVO: filtro por status de pagamento
const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'Todos os pagamentos' },
  { value: 'PAID',     label: '✅ Pago' },
  { value: 'PENDING',  label: '🕐 Pendente' },
  { value: 'FAILED',   label: '❌ Falhou' },
  { value: 'REFUNDED', label: '↩️ Reembolsado' },
]

const PAYMENT_BADGE: Record<string, string> = {
  PAID:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  PENDING:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  FAILED:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  REFUNDED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const PAYMENT_LABEL: Record<string, string> = {
  PAID:     'Pago',
  PENDING:  'Pendente',
  FAILED:   'Falhou',
  REFUNDED: 'Reembolsado',
}

interface OrdersTableProps {
  orders: Order[]
  total: number
  page: number
  pageSize: number
  currentFilters: Record<string, string | undefined>
}

export function OrdersTable({ orders, total, page, pageSize, currentFilters }: OrdersTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState(currentFilters.q ?? '')

  const totalPages = Math.ceil(total / pageSize)

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams()
    // Manter filtros existentes, resetar página ao filtrar
    Object.entries(currentFilters).forEach(([k, v]) => {
      if (v && k !== 'page' && k !== key) params.set(k, v)
    })
    if (value) params.set(key, value)
    if (key !== 'page') params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }, [currentFilters, pathname, router])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilter('q', search)
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Busca: nome, telefone ou número do pedido */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, telefone ou nº pedido"
              className="pl-9 pr-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring w-52"
            />
          </div>
          <button type="submit" className="px-3 py-2 text-sm bg-muted rounded-lg hover:bg-muted/70 transition-colors">
            Buscar
          </button>
        </form>

        {/* Filtro de status do pedido */}
        <select
          value={currentFilters.status ?? ''}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Filtro de tipo */}
        <select
          value={currentFilters.type ?? ''}
          onChange={(e) => updateFilter('type', e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Filtro de status de pagamento */}
        <select
          value={currentFilters.paymentStatus ?? ''}
          onChange={(e) => updateFilter('paymentStatus', e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {PAYMENT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Filtro de forma de pagamento */}
        <select
          value={currentFilters.payment ?? ''}
          onChange={(e) => updateFilter('payment', e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Todas as formas</option>
          <option value="PIX">⚡ PIX</option>
          <option value="CREDIT_CARD">💳 Crédito</option>
          <option value="DEBIT_CARD">💳 Débito</option>
          <option value="CASH">💵 Dinheiro</option>
        </select>

        {/* Link para kanban */}
        <Link
          href="/dashboard/orders/kanban"
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-input rounded-lg bg-background hover:bg-muted transition-colors ml-auto"
        >
          <LayoutGrid className="h-4 w-4" />
          Ver Kanban
        </Link>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pedido</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pgto.</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Forma</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    Nenhum pedido encontrado
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">
                        {formatOrderNumber(order.orderNumber)}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {order._count.items} {order._count.items === 1 ? 'item' : 'itens'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-foreground">
                        {order.customer?.name ?? order.customer?.phone ?? '—'}
                      </span>
                      {order.table && (
                        <p className="text-xs text-muted-foreground">Mesa {order.table.number}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-muted-foreground">
                        {order.type === 'DELIVERY' ? '🛵 Delivery' :
                         order.type === 'TABLE'    ? '🍽️ Mesa' :
                         order.type === 'PICKUP'   ? '🏪 Retirada' : '💳 Balcão'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        PAYMENT_BADGE[order.paymentStatus] ?? ''
                      )}>
                        {PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {order.payments && order.payments.length > 0 ? (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {[...new Set(order.payments.map((p: any) => {
                            const m: Record<string, string> = {
                              PIX: '⚡ PIX',
                              CREDIT_CARD: '💳 Crédito',
                              DEBIT_CARD: '💳 Débito',
                              CASH: '💵 Dinheiro',
                            }
                            return m[p.method] ?? p.method
                          }))].join(' + ')}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDate(order.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-sm text-muted-foreground">
              {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} de {total}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => updateFilter('page', String(page - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {/* Números de página */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const p = start + i
                return (
                  <button
                    key={p}
                    onClick={() => updateFilter('page', String(p))}
                    className={cn(
                      'min-w-[2rem] px-2 py-1.5 rounded-lg border text-sm transition-colors',
                      p === page
                        ? 'border-primary bg-primary text-primary-foreground font-medium'
                        : 'border-input hover:bg-muted'
                    )}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => updateFilter('page', String(page + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-muted transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
