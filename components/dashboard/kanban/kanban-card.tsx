'use client'

// components/dashboard/kanban/kanban-card.tsx

import { useState } from 'react'
import { formatCurrency, formatRelative, formatOrderNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, User, MapPin, Table2 } from 'lucide-react'
import type { KanbanOrder } from './kanban-board'

interface KanbanCardProps {
  order: KanbanOrder
  isDragging: boolean
  onDragStart?: () => void
}

const TYPE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  DELIVERY: { label: 'Delivery',  emoji: '🛵', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  TABLE:    { label: 'Mesa',      emoji: '🍽️', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  PICKUP:   { label: 'Retirada',  emoji: '🏪', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  PDV:      { label: 'Balcão',    emoji: '💳', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
}

const PAYMENT_CONFIG: Record<string, { label: string; color: string }> = {
  PAID:    { label: 'Pago',     color: 'text-emerald-600 dark:text-emerald-400' },
  PENDING: { label: 'Aguardando', color: 'text-yellow-600 dark:text-yellow-400' },
  FAILED:  { label: 'Falhou',   color: 'text-red-600 dark:text-red-400' },
}

export function KanbanCard({ order, isDragging, onDragStart }: KanbanCardProps) {
  const [expanded, setExpanded] = useState(false)
  const typeConfig = TYPE_CONFIG[order.type] ?? TYPE_CONFIG.PDV
  const paymentConfig = PAYMENT_CONFIG[order.paymentStatus] ?? PAYMENT_CONFIG.PENDING

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className={cn(
        'bg-card border border-border rounded-lg transition-all select-none',
        onDragStart ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        isDragging ? 'opacity-50 scale-95 rotate-1 shadow-lg' : 'hover:border-primary/40 hover:shadow-sm'
      )}
    >
      {/* Header do card */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-foreground">
              {formatOrderNumber(order.orderNumber)}
            </span>
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', typeConfig.color)}>
              {typeConfig.emoji} {typeConfig.label}
            </span>
          </div>
          <span className="text-xs font-bold text-foreground">
            {formatCurrency(order.total)}
          </span>
        </div>

        {/* Cliente */}
        {order.customer && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <User className="h-3 w-3" />
            <span className="truncate">{order.customer.name ?? order.customer.phone}</span>
          </div>
        )}

        {/* Mesa ou bairro */}
        {order.table && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Table2 className="h-3 w-3" />
            <span>Mesa {order.table.number} • {order.table.sector}</span>
          </div>
        )}
        {order.deliveryBairro && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <MapPin className="h-3 w-3" />
            <span>{order.deliveryBairro}</span>
          </div>
        )}

        {/* Rodapé: tempo e pagamento */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-muted-foreground">
            {formatRelative(order.createdAt)}
          </span>
          <span className={cn('text-[10px] font-medium', paymentConfig.color)}>
            {paymentConfig.label}
          </span>
        </div>
      </div>

      {/* Expandir itens */}
      <button
        onPointerDown={(e) => e.stopPropagation()} // não iniciar drag ao clicar
        onClick={(e) => {
          e.stopPropagation()
          setExpanded((x) => !x)
        }}
        className="w-full flex items-center justify-between px-3 py-1.5 border-t border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors rounded-b-lg"
      >
        <span>{order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {/* Lista de itens (expandida) */}
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-border">
          {order.items.map((item) => (
            <div key={item.id} className="text-xs pt-2">
              <span className="font-medium text-foreground">
                {item.quantity}× {item.productName}
              </span>
              {item.addons.length > 0 && (
                <p className="text-muted-foreground pl-4 text-[10px]">
                  + {item.addons.map((a) => a.addonName).join(', ')}
                </p>
              )}
              {item.notes && (
                <p className="text-muted-foreground pl-4 text-[10px] italic">
                  "{item.notes}"
                </p>
              )}
            </div>
          ))}
          {order.notes && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 mt-2">
              📝 {order.notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
