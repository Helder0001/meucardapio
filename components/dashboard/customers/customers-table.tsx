'use client'

// components/dashboard/customers/customers-table.tsx

import { useRouter, usePathname } from 'next/navigation'
import { formatCurrency, formatDate, formatPhone, formatRelative } from '@/lib/utils/format'
import { Search, ChevronLeft, ChevronRight, CheckCircle2, Clock } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Customer {
  id: string
  name: string | null
  phone: string
  email: string | null
  totalOrders: number
  totalSpent: number
  loyaltyPoints: number
  cashbackBalance: number
  lastOrderAt: Date | null
  createdAt: Date
  isVerified: boolean
}

interface CustomersTableProps {
  customers: Customer[]
  total: number
  page: number
  pageSize: number
  query: string
}

export function CustomersTable({ customers, total, page, pageSize, query }: CustomersTableProps) {
  const router   = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState(query)
  const totalPages = Math.ceil(total / pageSize)

  const go = (params: Record<string, string>) => {
    const p = new URLSearchParams({ ...(query ? { q: query } : {}), ...params })
    router.push(`${pathname}?${p}`)
  }

  return (
    <div className="space-y-4">
      {/* Busca */}
      <form
        onSubmit={(e) => { e.preventDefault(); go({ q: search, page: '1' }) }}
        className="flex gap-2"
      >
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, telefone ou email..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="px-3 py-2 text-sm bg-muted rounded-lg hover:bg-muted/70 transition-colors"
        >
          Buscar
        </button>
        {query && (
          <button
            type="button"
            onClick={() => { setSearch(''); go({}) }}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpar
          </button>
        )}
      </form>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Cliente', 'Pedidos', 'Total gasto', 'Cashback', 'Pontos', 'Último pedido'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                    {query ? `Nenhum resultado para "${query}"` : 'Nenhum cliente ainda'}
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary">
                            {(c.name ?? c.phone)[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {c.name ?? '—'}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {formatPhone(c.phone)}
                            {c.isVerified
                              ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              : <Clock className="h-3 w-3 text-yellow-500" />
                            }
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{c.totalOrders}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {formatCurrency(c.totalSpent)}
                    </td>
                    <td className="px-4 py-3">
                      {c.cashbackBalance > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {formatCurrency(c.cashbackBalance)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.loyaltyPoints > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          {c.loyaltyPoints} pts
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {c.lastOrderAt ? formatRelative(c.lastOrderAt) : 'Nunca'}
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
            <span className="text-xs text-muted-foreground">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => go({ page: String(page - 1) })}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => go({ page: String(page + 1) })}
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
