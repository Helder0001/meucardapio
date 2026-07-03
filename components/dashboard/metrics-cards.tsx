// components/dashboard/metrics-cards.tsx

import { TrendingUp, TrendingDown, ShoppingBag, DollarSign, Clock, HelpCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

interface MetricsCardsProps {
  metrics: {
    todayOrdersCount: number
    todayRevenue: number
    weekRevenue: number
    monthRevenue: number
    monthOrdersCount: number
    avgTicket: number
    pendingOrders: number
    todayChangePct?: number | null
    weekChangePct?: number | null
    monthChangePct?: number | null
  }
}

const cards = (metrics: MetricsCardsProps['metrics']) => [
  {
    label: 'Faturamento hoje',
    value: formatCurrency(metrics.todayRevenue),
    sub: `${metrics.todayOrdersCount} pedidos hoje`,
    changePct: metrics.todayChangePct,
    tooltip: 'Faturamento de hoje comparado com o faturamento de ontem.',
    icon: DollarSign,
    gradient: 'from-emerald-400 to-emerald-600',
    accent: 'border-l-emerald-500',
  },
  {
    label: 'Faturamento da semana',
    value: formatCurrency(metrics.weekRevenue),
    sub: 'Últimos 7 dias',
    changePct: metrics.weekChangePct,
    tooltip: 'Faturamento dos últimos 7 dias comparado com os 7 dias anteriores.',
    icon: TrendingUp,
    gradient: 'from-blue-400 to-blue-600',
    accent: 'border-l-blue-500',
  },
  {
    label: 'Faturamento do mês',
    value: formatCurrency(metrics.monthRevenue),
    sub: `${metrics.monthOrdersCount} pedidos`,
    changePct: metrics.monthChangePct,
    tooltip: 'Faturamento do mês atual comparado com o mês anterior.',
    icon: ShoppingBag,
    gradient: 'from-violet-400 to-violet-600',
    accent: 'border-l-violet-500',
  },
  {
    label: 'Ticket médio',
    value: formatCurrency(metrics.avgTicket),
    sub: 'Este mês',
    changePct: null,
    tooltip: 'Valor médio dos pedidos feitos no mês atual (faturamento do mês dividido pelo número de pedidos).',
    icon: Clock,
    gradient: 'from-orange-400 to-orange-600',
    accent: 'border-l-orange-500',
  },
]

function ChangeBadge({ pct }: { pct: number }) {
  const isUp = pct >= 0
  const Icon = isUp ? TrendingUp : TrendingDown
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md',
      isUp
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
        : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
    )}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

// Ícone de "?" que mostra, ao passar o mouse, com o que o percentual do
// card está sendo comparado. Centralizado sob o ícone e com largura
// limitada ao viewport para não ficar cortado em telas pequenas.
function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex ml-1 flex-shrink-0">
      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-5 z-20 w-52 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover text-popover-foreground text-[11px] leading-snug p-2 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity">
        {text}
      </span>
    </span>
  )
}

export function MetricsCards({ metrics }: MetricsCardsProps) {
  const items = cards(metrics)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {items.map((card) => (
        <div
          key={card.label}
          className={`bg-card border border-border border-l-4 ${card.accent} rounded-xl p-3.5 md:p-5 transition-shadow hover:shadow-card-hover shadow-card`}
        >
          <div className="flex items-start justify-between mb-2 md:mb-4">
            <p className="text-xs md:text-sm font-medium text-muted-foreground leading-snug flex items-center">
              {card.label}
              <InfoTooltip text={card.tooltip} />
            </p>
            <div className={`w-7 h-7 md:w-9 md:h-9 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center flex-shrink-0 ml-1 shadow-sm`}>
              <card.icon className="h-3.5 w-3.5 md:h-4 md:w-4 text-white" />
            </div>
          </div>
          <p className="text-base md:text-2xl font-bold text-foreground tracking-tight">{card.value}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <p className="text-xs text-muted-foreground">{card.sub}</p>
            {typeof card.changePct === 'number' && <ChangeBadge pct={card.changePct} />}
          </div>
        </div>
      ))}
    </div>
  )
}
