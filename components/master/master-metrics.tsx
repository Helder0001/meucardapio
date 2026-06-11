// components/master/master-metrics.tsx

import { formatCurrency } from '@/lib/utils/format'
import { Users, TrendingUp, AlertCircle, ShoppingBag } from 'lucide-react'

interface MasterMetricsProps {
  metrics: {
    totalTenants: number
    activeTenants: number
    trialTenants: number
    suspendedTenants: number
    mrr: number
    arr: number
    ordersToday: number
  }
}

export function MasterMetricsCards({ metrics }: MasterMetricsProps) {
  const cards = [
    {
      label: 'MRR',
      value: formatCurrency(metrics.mrr),
      sub: `ARR: ${formatCurrency(metrics.arr)}`,
      icon: TrendingUp,
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      label: 'Estabelecimentos ativos',
      value: metrics.activeTenants.toLocaleString('pt-BR'),
      sub: `${metrics.trialTenants} em trial`,
      icon: Users,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Total de tenants',
      value: metrics.totalTenants.toLocaleString('pt-BR'),
      sub: `${metrics.suspendedTenants} suspensos`,
      icon: Users,
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    },
    {
      label: 'Pedidos hoje',
      value: metrics.ordersToday.toLocaleString('pt-BR'),
      sub: 'toda a plataforma',
      icon: ShoppingBag,
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-card border border-border rounded-xl p-5">
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
