'use client'

// components/dashboard/kanban/kanban-board.tsx
//
// Kanban de pedidos com:
// - Conexão SSE para atualizações em tempo real
// - Drag & drop entre colunas (DnD nativo HTML5)
// - Notificação sonora ao chegar novo pedido
// - Filtros por tipo de pedido
// - Indicador de conexão ao vivo

import { useState, useEffect, useRef, useCallback } from 'react'
import { KanbanColumn } from './kanban-column'
import { formatOrderNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import { Wifi, WifiOff, Volume2, VolumeX, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export type KanbanOrder = {
  id: string
  orderNumber: number
  status: string
  paymentStatus: string
  type: string
  total: number
  createdAt: string
  notes: string | null
  deliveryBairro: string | null
  table: { number: number; sector: string } | null
  customer: { name: string | null; phone: string } | null
  waiter: { name: string } | null
  pdv: { name: string } | null
  items: Array<{
    id: string
    productName: string
    quantity: number
    notes: string | null
    addons: Array<{ addonName: string }>
  }>
}

const COLUMNS = [
  { key: 'PENDING',          label: 'Pendentes',     color: 'bg-yellow-500',  emoji: '⏳' },
  { key: 'CONFIRMED',        label: 'Confirmados',   color: 'bg-blue-500',    emoji: '✅' },
  { key: 'PREPARING',        label: 'Preparando',    color: 'bg-brand-500',  emoji: '👨‍🍳' },
  { key: 'READY',            label: 'Prontos',       color: 'bg-emerald-500', emoji: '📦' },
  { key: 'OUT_FOR_DELIVERY', label: 'Saiu p/ entrega', color: 'bg-purple-500', emoji: '🛵' },
  { key: 'DELIVERED',        label: 'Entregues',     color: 'bg-green-500',   emoji: '🎉' },
] as const

type FilterType = 'ALL' | 'TABLE' | 'DELIVERY' | 'PICKUP'

interface KanbanBoardProps {
  tenantId: string
  userRole?: string
  /** Se definido, trava o filtro nesse tipo e oculta os botões de filtro */
  lockedFilter?: FilterType
}

export function KanbanBoard({ tenantId, userRole = '', lockedFilter }: KanbanBoardProps) {
  const [orders, setOrders] = useState<KanbanOrder[]>([])
  const [connected, setConnected] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [filter, setFilter] = useState<FilterType>(lockedFilter ?? 'ALL')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const isDeliveryPerson = userRole === 'DELIVERY_PERSON'
  const audioRef = useRef<AudioContext | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Tocar som de notificação
  const playNotification = useCallback(() => {
    if (!soundEnabled) return
    try {
      if (!audioRef.current) {
        audioRef.current = new AudioContext()
      }
      const ctx = audioRef.current
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.frequency.setValueAtTime(800, ctx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1)
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.3)
    } catch {
      // AudioContext pode não estar disponível
    }
  }, [soundEnabled])

  // Conectar ao SSE
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource('/api/orders/kanban')
    eventSourceRef.current = es

    es.addEventListener('init', (e) => {
      const data = JSON.parse(e.data)
      setOrders(data.orders)
      setConnected(true)
      setLoading(false)
      // Cancelar pedidos PIX pendentes sem confirmação há mais de 15 min
      fetch('/api/orders/auto-cancel', { method: 'POST' })
        .then((r) => r.json())
        .then((d) => {
          if (d.cancelled > 0) {
            console.log(`[kanban] ${d.cancelled} pedido(s) PIX cancelado(s) automaticamente`)
          }
        })
        .catch(() => {})
    })

    es.addEventListener('order_update', (e) => {
      const event = JSON.parse(e.data)

      setOrders((prev) => {
        switch (event.type) {
          case 'ORDER_CREATED': {
            // Novo pedido chegou — adicionar à coluna PENDING
            if (!prev.find((o) => o.id === event.orderId)) {
              playNotification()
              toast.info(`Novo pedido ${formatOrderNumber(event.orderNumber)}!`, {
                duration: 6000,
              })
              // Buscar dados completos do pedido
              fetch(`/api/orders/${event.orderId}`)
                .then((r) => r.json())
                .then((order) => {
                  setOrders((p) => [order, ...p])
                })
                .catch(() => {})
            }
            return prev
          }

          case 'ORDER_UPDATED': {
            // Status atualizado — mover para outra coluna
            return prev.map((o) =>
              o.id === event.orderId
                ? { ...o, status: event.status, paymentStatus: event.paymentStatus ?? o.paymentStatus }
                : o
            ).filter((o) =>
              // Remover da lista se entregue/cancelado há mais de 2 min
              !(['DELIVERED', 'CANCELLED'].includes(o.status) &&
                Date.now() - new Date(o.createdAt).getTime() > 2 * 60 * 1000)
            )
          }

          default:
            return prev
        }
      })
    })

    es.addEventListener('heartbeat', () => {
      setConnected(true)
    })

    es.onerror = () => {
      setConnected(false)
      // Reconectar após 5 segundos (inclui quando Vercel mata a conexão SSE após 300s)
      setTimeout(connect, 5000)
    }

    // Polling fallback a cada 60s: refetch estado inicial caso SSE falhe silenciosamente
    const pollFallback = setInterval(async () => {
      if (es.readyState === EventSource.CLOSED) {
        clearInterval(pollFallback)
        return
      }
      try {
        // Apenas refresh via SSE reconnect — não precisa fetch separado
        // O onerror já trata reconexão. Esse interval é só um watchdog.
      } catch {}
    }, 60_000)
  }, [playNotification])

  useEffect(() => {
    connect()
    return () => {
      eventSourceRef.current?.close()
    }
  }, [connect])
  const handleDragStart = (orderId: string) => {
    setDraggingId(orderId)
  }

  const handleDrop = async (targetStatus: string) => {
    if (!draggingId) return
    const order = orders.find((o) => o.id === draggingId)
    if (!order || order.status === targetStatus) {
      setDraggingId(null)
      return
    }

    // Otimistic update: atualizar UI imediatamente
    setOrders((prev) =>
      prev.map((o) => (o.id === draggingId ? { ...o, status: targetStatus } : o))
    )
    setDraggingId(null)

    // Persistir no servidor
    try {
      const res = await fetch(`/api/orders/${draggingId}/update-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erro ao atualizar status')
        // Reverter update otimista
        setOrders((prev) =>
          prev.map((o) => (o.id === draggingId ? { ...o, status: order.status } : o))
        )
      }
    } catch {
      toast.error('Erro de conexão ao atualizar pedido')
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: order.status } : o))
      )
    }
  }

  // Filtrar pedidos
  const filteredOrders = orders.filter((o) =>
    filter === 'ALL' ? true : o.type === filter
  )

  const ordersByStatus = (status: string) =>
    filteredOrders.filter((o) => o.status === status)

  // OUT_FOR_DELIVERY só é relevante para delivery — esconde em mesa/retirada/balcão
  // Para entregador, sempre mostra a coluna OUT_FOR_DELIVERY
  const visibleColumns = COLUMNS.filter((col) => {
    if (col.key === 'OUT_FOR_DELIVERY') {
      return isDeliveryPerson || filter === 'ALL' || filter === 'DELIVERY'
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filtros — ocultados quando o filtro está travado (ex: entregador) */}
        <div className="flex gap-1.5">
          {!lockedFilter && (['ALL', 'DELIVERY', 'TABLE', 'PICKUP'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filter === f
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              )}
            >
              {f === 'ALL' ? 'Todos' : f === 'DELIVERY' ? '🛵 Delivery' : f === 'TABLE' ? '🍽️ Mesa' : '🏪 Retirada'}
              <span className="ml-1.5 bg-background/20 rounded-full px-1.5">
                {f === 'ALL' ? orders.length : orders.filter((o) => o.type === f).length}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={soundEnabled ? 'Desativar som' : 'Ativar som'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          <button
            onClick={connect}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Reconectar"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>

          <div className={cn(
            'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
            connected
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          )}>
            {connected ? (
              <><Wifi className="h-3 w-3" /> Ao vivo</>
            ) : (
              <><WifiOff className="h-3 w-3" /> Reconectando...</>
            )}
          </div>
        </div>
      </div>

      {/* Colunas do kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {visibleColumns.map((col) => (
          <KanbanColumn
            key={col.key}
            column={col}
            orders={ordersByStatus(col.key)}
            draggingId={draggingId}
            onDragStart={isDeliveryPerson ? undefined : handleDragStart}
            onDrop={isDeliveryPerson ? undefined : handleDrop}
            loading={loading}
          />
        ))}
      </div>
    </div>
  )
}
