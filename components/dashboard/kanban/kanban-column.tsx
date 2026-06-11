'use client'

// components/dashboard/kanban/kanban-column.tsx

import { KanbanCard } from './kanban-card'
import type { KanbanOrder } from './kanban-board'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface ColumnDef {
  key: string
  label: string
  color: string
  emoji: string
}

interface KanbanColumnProps {
  column: ColumnDef
  orders: KanbanOrder[]
  draggingId: string | null
  onDragStart?: (id: string) => void
  onDrop?: (status: string) => void
  loading?: boolean
}

export function KanbanColumn({
  column,
  orders,
  draggingId,
  onDragStart,
  onDrop,
  loading,
}: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsOver(true)
  }

  const handleDragLeave = () => setIsOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsOver(false)
    onDrop?.(column.key)
  }

  return (
    <div
      className={cn(
        'flex-shrink-0 w-72 rounded-xl border transition-all',
        isOver
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-border bg-muted/30'
      )}
      onDragOver={onDrop ? handleDragOver : undefined}
      onDragLeave={onDrop ? handleDragLeave : undefined}
      onDrop={onDrop ? handleDrop : undefined}
    >
      {/* Header da coluna */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm">{column.emoji}</span>
          <span className="font-semibold text-sm text-foreground">{column.label}</span>
        </div>
        <span className={cn(
          'text-xs font-bold px-2 py-0.5 rounded-full text-white',
          column.color
        )}>
          {orders.length}
        </span>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2 min-h-[120px]">
        {loading ? (
          // Skeleton loading
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">
            Nenhum pedido
          </div>
        ) : (
          orders.map((order) => (
            <KanbanCard
              key={order.id}
              order={order}
              isDragging={draggingId === order.id}
              onDragStart={onDragStart ? () => onDragStart(order.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  )
}
