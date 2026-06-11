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

export function RecentOrders({ orders }: RecentOrdersProps) {
  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <h2 className="font-semibold text-foreground">Pedidos recentes</h2>
        <Link
          href="/dashboard/orders"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          Ver todos
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          Nenhum pedido ainda. Compartilhe seu cardápio para começar!
        </div>
      ) : (
        <div className="divide-y divide-border">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/dashboard/orders/${order.id}`}
              className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs font-bold text-muted-foreground">
                    #{order.orderNumber}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {order.customer?.name ?? order.customer?.phone ?? 'Cliente'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(order.createdAt)} • {order.type}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <OrderStatusBadge status={order.status} />
                <span className="text-sm font-semibold text-foreground">
                  {formatCurrency(Number(order.total))}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
