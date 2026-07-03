// components/dashboard/order-status-badge.tsx

import { cn } from '@/lib/utils'

const statusConfig: Record<string, { label: string; dot: string; className: string }> = {
  PENDING:          { label: 'Pendente',         dot: 'bg-amber-400',   className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  CONFIRMED:        { label: 'Confirmado',        dot: 'bg-blue-400',    className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  PREPARING:        { label: 'Preparando',        dot: 'bg-brand-400',  className: 'bg-brand-50 text-brand-700 border border-brand-200' },
  READY:            { label: 'Pronto',            dot: 'bg-emerald-400', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  OUT_FOR_DELIVERY: { label: 'Saiu p/ entrega',   dot: 'bg-violet-400',  className: 'bg-violet-50 text-violet-700 border border-violet-200' },
  DELIVERED:        { label: 'Entregue',          dot: 'bg-green-400',   className: 'bg-green-50 text-green-700 border border-green-200' },
  CANCELLED:        { label: 'Cancelado',         dot: 'bg-red-400',     className: 'bg-red-50 text-red-700 border border-red-200' },
  REFUNDED:         { label: 'Reembolsado',       dot: 'bg-gray-400',    className: 'bg-gray-50 text-gray-600 border border-gray-200' },
}

export function OrderStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? {
    label: status,
    dot: 'bg-gray-400',
    className: 'bg-muted text-muted-foreground border border-border',
  }

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
      config.className
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', config.dot)} />
      {config.label}
    </span>
  )
}
