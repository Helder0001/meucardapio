// hooks/use-dashboard-notifications.ts
//
// Hook que conecta ao SSE de notificações e dispara:
//   - Som de alerta quando chega pedido novo
//   - Notificação Push via Notification API (se o usuário permitiu)
//   - Badge no título da aba (ex: "(3) Meu Cardápio")
//
// Uso: colocar no layout do dashboard — conecta uma vez e persiste.

'use client'

import { useEffect, useRef, useCallback } from 'react'

interface NewOrderEvent {
  orderId: string
  orderNumber: number
  total: number
  type: string
}

interface Options {
  onNewOrder?: (event: NewOrderEvent) => void
  soundEnabled?: boolean
}

// Gera um beep sintético via Web Audio API — sem dependências externas
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.connect(gain)
    gain.connect(ctx.destination)

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, ctx.currentTime)       // Lá5
    oscillator.frequency.setValueAtTime(1046, ctx.currentTime + 0.1) // Dó6

    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.4)

    setTimeout(() => ctx.close(), 1000)
  } catch {
    // Web Audio não disponível — silencioso
  }
}

async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

function sendPushNotification(event: NewOrderEvent) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  new Notification('🛎️ Novo pedido!', {
    body: `Pedido #${String(event.orderNumber).padStart(4, '0')} — R$ ${event.total.toFixed(2)}`,
    icon: '/icons/icon-192.png',
    tag: `order-${event.orderId}`, // Evita duplicatas
    requireInteraction: false,
  })
}

export function useDashboardNotifications({ onNewOrder, soundEnabled = true }: Options = {}) {
  const esRef = useRef<EventSource | null>(null)
  const pendingRef = useRef(0)

  const updateTabBadge = useCallback((delta: number) => {
    pendingRef.current = Math.max(0, pendingRef.current + delta)
    const count = pendingRef.current
    document.title = count > 0
      ? `(${count}) Meu Cardápio — Dashboard`
      : 'Meu Cardápio — Dashboard'
  }, [])

  useEffect(() => {
    // Solicitar permissão de notificação push ao montar
    requestNotificationPermission()

    const connect = () => {
      esRef.current?.close()
      const es = new EventSource('/api/notifications/stream')
      esRef.current = es

      es.addEventListener('new_order', (e) => {
        try {
          const event: NewOrderEvent = JSON.parse(e.data)
          if (soundEnabled) playAlertSound()
          sendPushNotification(event)
          updateTabBadge(+1)
          onNewOrder?.(event)
        } catch {}
      })

      es.addEventListener('low_stock', (e) => {
        try {
          const { productName, quantity } = JSON.parse(e.data)
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⚠️ Estoque baixo', {
              body: quantity <= 0
                ? `"${productName}" está esgotado`
                : `Restam ${quantity} unidade(s) de "${productName}"`,
              tag: `stock-${productName}`,
            })
          }
        } catch {}
      })

      es.addEventListener('heartbeat', () => {
        // Conexão viva — nada a fazer
      })

      es.onerror = () => {
        // Reconectar após 5s em caso de erro
        es.close()
        setTimeout(connect, 5_000)
      }
    }

    connect()

    return () => {
      esRef.current?.close()
    }
  }, [soundEnabled, onNewOrder, updateTabBadge])

  // Expõe função para zerar o badge (chamar quando o usuário abre os pedidos)
  return {
    clearBadge: () => {
      pendingRef.current = 0
      document.title = 'Meu Cardápio — Dashboard'
    },
  }
}
