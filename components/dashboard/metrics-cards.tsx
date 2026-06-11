// components/dashboard/metrics-cards.tsx

import { TrendingUp, ShoppingBag, DollarSign, Clock } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'

interface MetricsCardsProps {
  metrics: {
    todayOrdersCount: number
    todayRevenue: number
    weekRevenue: number
    monthRevenue: number
    monthOrdersCount: number
    avgTicket: number
    pendingOrders: number
  }
}

export function MetricsCards({ metrics }: MetricsCardsProps) {
  const cards = [
    {
      label: 'Faturamento hoje',
      value: formatCurrency(metrics.todayRevenue),
      sub: `${metrics.todayOrdersCount} pedidos`,
      icon: DollarSign,
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      label: 'Faturamento da semana',
      value: formatCurrency(metrics.weekRevenue),
      sub: 'Últimos 7 dias',
      icon: TrendingUp,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Faturamento do mês',
      value: formatCurrency(metrics.monthRevenue),
      sub: `${metrics.monthOrdersCount} pedidos`,
      icon: ShoppingBag,
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    },
    {
      label: 'Ticket médio',
      value: formatCurrency(metrics.avgTicket),
      sub: 'Este mês',
      icon: TrendingUp,
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-card border border-border rounded-xl p-5"
        >
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <div className={`p-2 rounded-lg ${card.color}`}>
              <card.icon className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{card.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}
