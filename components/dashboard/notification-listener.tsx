'use client'

// components/dashboard/notification-listener.tsx
//
// CORREÇÃO (#3 — nenhuma notificação chegava no dashboard): a rota
// app/api/notifications/stream/route.ts já existia (SSE de novo pedido,
// estoque baixo, falha de pagamento), mas nenhum componente do front-end
// jamais se conectava a ela — o sininho no cabeçalho só mostrava uma
// contagem de pedidos pendentes via polling a cada 30s, sem toast nem som,
// e só refletia pedido PENDENTE, não os outros tipos de alerta.
//
// Este componente fica montado no layout do dashboard inteiro (não só na
// tela do Kanban), então a pessoa recebe o toast + som de novo pedido em
// qualquer página onde estiver — igual ao que o comentário da própria rota
// SSE já dizia que deveria acontecer ("mesmo sem o kanban aberto").
//
// Renderiza null — é só o "ouvido" da stream; o desbloqueio de áudio e o
// beep em si ficam no módulo compartilhado notification-sound.ts, também
// usado pelo Kanban (que consome sua própria stream separada, mais rica,
// pra atualizar as colunas — aqui só cuida do alerta sonoro/toast global).

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ensureAudioUnlocked, playNotificationBeep, isSoundEnabled } from '@/lib/utils/notification-sound'
import { formatOrderNumber, formatCurrency } from '@/lib/utils/format'

export function NotificationListener() {
  const eventSourceRef = useRef<EventSource | null>(null)
  const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    ensureAudioUnlocked()

    let cancelled = false

    const connect = () => {
      if (cancelled) return
      const es = new EventSource('/api/notifications/stream')
      eventSourceRef.current = es

      es.addEventListener('new_order', (e) => {
        try {
          const data = JSON.parse(e.data)
          if (isSoundEnabled()) playNotificationBeep()
          // Avisa o sininho do cabeçalho pra reconsultar a contagem na
          // hora, em vez de esperar o próximo ciclo de 30s do polling.
          window.dispatchEvent(new Event('meucardapio:new-order'))
          toast.info(`Novo pedido ${formatOrderNumber(data.orderNumber)}!`, {
            description: typeof data.total === 'number' ? formatCurrency(data.total) : undefined,
            duration: 6000,
          })
        } catch {}
      })

      es.addEventListener('low_stock', (e) => {
        try {
          const data = JSON.parse(e.data)
          toast.warning(`Estoque baixo: ${data.productName}`, {
            description: `Restam ${data.quantity} unidade${data.quantity === 1 ? '' : 's'}.`,
            duration: 8000,
          })
        } catch {}
      })

      // Reconecta em caso de queda (rede, deploy, etc.) — mesmo padrão de
      // backoff simples já usado no Kanban.
      es.onerror = () => {
        es.close()
        if (cancelled) return
        retryTimerRef.current = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      cancelled = true
      eventSourceRef.current?.close()
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  return null
}
