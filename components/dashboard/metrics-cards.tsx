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

const cards = (metrics: MetricsCardsProps['metrics']) => [
  {
    label: 'Faturamento hoje',
    value: formatCurrency(metrics.todayRevenue),
    sub: `${metrics.todayOrdersCount} pedidos hoje`,
    icon: DollarSign,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    accent: 'border-l-emerald-500',
  },
  {
    label: 'Faturamento da semana',
    value: formatCurrency(metrics.weekRevenue),
    sub: 'Últimos 7 dias',
    icon: TrendingUp,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    accent: 'border-l-blue-500',
  },
  {
    label: 'Faturamento do mês',
    value: formatCurrency(metrics.monthRevenue),
    sub: `${metrics.monthOrdersCount} pedidos`,
    icon: ShoppingBag,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    accent: 'border-l-violet-500',
  },
  {
    label: 'Ticket médio',
    value: formatCurrency(metrics.avgTicket),
    sub: 'Este mês',
    icon: Clock,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    accent: 'border-l-orange-500',
  },
]

export function MetricsCards({ metrics }: MetricsCardsProps) {
  const items = cards(metrics)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {items.map((card) => (
        <div
          key={card.label}
          className={`bg-card border border-border border-l-4 ${card.accent} rounded-xl p-3.5 md:p-5 transition-shadow hover:shadow-md`}
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="flex items-start justify-between mb-2 md:mb-4">
            <p className="text-xs md:text-sm font-medium text-muted-foreground leading-snug">{card.label}</p>
            <div className={`w-7 h-7 md:w-9 md:h-9 rounded-lg ${card.iconBg} flex items-center justify-center flex-shrink-0 ml-1`}>
              <card.icon className={`h-3.5 w-3.5 md:h-4 md:w-4 ${card.iconColor}`} />
            </div>
          </div>
          <p className="text-base md:text-2xl font-bold text-foreground tracking-tight">{card.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}
