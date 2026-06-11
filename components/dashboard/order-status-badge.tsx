// components/dashboard/order-status-badge.tsx

import { cn } from '@/lib/utils'

const statusConfig: Record<string, { label: string; className: string }> = {
  PENDING:          { label: 'Pendente',       className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  CONFIRMED:        { label: 'Confirmado',     className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  PREPARING:        { label: 'Preparando',     className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  READY:            { label: 'Pronto',         className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  OUT_FOR_DELIVERY: { label: 'Saiu p/ entrega', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  DELIVERED:        { label: 'Entregue',       className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  CANCELLED:        { label: 'Cancelado',      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  REFUNDED:         { label: 'Reembolsado',    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

export function OrderStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, className: 'bg-muted text-muted-foreground' }
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', config.className)}>
      {config.label}
    </span>
  )
}
