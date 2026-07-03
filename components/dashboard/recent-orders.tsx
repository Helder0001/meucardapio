// components/dashboard/recent-orders.tsx

import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { OrderStatusBadge } from './order-status-badge'
import { ArrowRight } from 'lucide-react'

interface RecentOrdersProps {
  orders: Array<{
    id: string
    orderNumber: number
    status: string
    paymentStatus: string
    total: any
    type: string
    createdAt: Date
    customer: { name: string | null; phone: string } | null
  }>
}

const typeLabel: Record<string, string> = {
  DINE_IN:  'Mesa',
  TAKEAWAY: 'Retirada',
  DELIVERY: 'Delivery',
  TABLE:    'Mesa',
  PICKUP:   'Retirada',
  PDV:      'Balcão',
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  return (
    <div
      className="bg-card border border-border rounded-xl overflow-hidden"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold text-foreground">Pedidos recentes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Últimas movimentações</p>
        </div>
        <Link
          href="/dashboard/orders"
          className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Ver todos
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm font-medium text-foreground">Nenhum pedido ainda</p>
          <p className="text-xs text-muted-foreground mt-1">
            Compartilhe seu cardápio para começar!
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/dashboard/orders/${order.id}`}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors group"
            >
              {/* Número do pedido */}
              <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-brand-600">
                  #{order.orderNumber}
                </span>
              </div>

              {/* Cliente + data */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {order.customer?.name ?? order.customer?.phone ?? 'Cliente'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(order.createdAt)} · {typeLabel[order.type] ?? order.type}
                </p>
              </div>

              {/* Status */}
              <div className="flex-shrink-0">
                <OrderStatusBadge status={order.status} />
              </div>

              {/* Valor */}
              <span className="text-sm font-bold text-foreground flex-shrink-0 tabular-nums">
                {formatCurrency(Number(order.total))}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
