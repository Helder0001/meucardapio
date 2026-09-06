'use client'

// components/dashboard/courier-location-tracker.tsx
//
// Mantém o cliente final vendo o percurso ao vivo do entregador no mapa.
// Roda em segundo plano no dashboard: a cada ~20s verifica se o usuário
// logado tem alguma entrega "Saiu para Entrega" em aberto; se tiver, passa
// a capturar a posição do GPS a cada ~8s e envia para o servidor.
//
// Não pede permissão de localização a ninguém que não esteja de fato
// entregando um pedido agora — só chama navigator.geolocation quando existe
// pelo menos uma entrega ativa.

import { useEffect, useRef, useState } from 'react'
import { Navigation, NavigationOff } from 'lucide-react'
import { cn } from '@/lib/utils'

const CHECK_ACTIVE_INTERVAL_MS = 20_000
const SEND_LOCATION_INTERVAL_MS = 8_000

export function CourierLocationTracker() {
  const [activeOrderIds, setActiveOrderIds] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'sharing' | 'error'>('idle')
  const activeOrderIdsRef = useRef<string[]>([])
  activeOrderIdsRef.current = activeOrderIds

  // Verifica periodicamente se há entregas ativas para rastrear
  useEffect(() => {
    let cancelled = false

    const checkActive = async () => {
      try {
        const res = await fetch('/api/delivery/active')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setActiveOrderIds((data.orders ?? []).map((o: { id: string }) => o.id))
      } catch {}
    }

    checkActive()
    const interval = setInterval(checkActive, CHECK_ACTIVE_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Enquanto houver entregas ativas, captura e envia a posição periodicamente
  useEffect(() => {
    if (activeOrderIds.length === 0) {
      setStatus('idle')
      return
    }
    if (!navigator.geolocation) {
      setStatus('error')
      return
    }

    const sendLocation = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setStatus('sharing')
          const { latitude, longitude } = pos.coords
          for (const orderId of activeOrderIdsRef.current) {
            fetch('/api/delivery/location', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId, lat: latitude, lng: longitude }),
            }).catch(() => {})
          }
        },
        () => setStatus('error'),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
      )
    }

    sendLocation()
    const interval = setInterval(sendLocation, SEND_LOCATION_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [activeOrderIds])

  if (activeOrderIds.length === 0) return null

  return (
    <div
      className={cn(
        // CORREÇÃO: no mobile o menu inferior (sidebar.tsx) é fixo em
        // bottom-0 com z-30; este aviso usava bottom-4 com z-50 (acima do
        // menu), ficando sobreposto aos botões de navegação. A partir de
        // md o menu inferior some (vira sidebar lateral), então só
        // precisa do respiro extra abaixo de md.
        'fixed bottom-20 md:bottom-4 right-4 z-30 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-xs font-medium border',
        status === 'sharing' && 'bg-emerald-500 text-white border-emerald-600',
        status === 'error'   && 'bg-red-500 text-white border-red-600',
        status === 'idle'    && 'bg-muted text-muted-foreground border-border'
      )}
    >
      {status === 'error' ? (
        <>
          <NavigationOff className="h-3.5 w-3.5" />
          Ative a localização para compartilhar o trajeto
        </>
      ) : (
        <>
          <Navigation className={cn('h-3.5 w-3.5', status === 'sharing' && 'animate-pulse')} />
          Compartilhando localização com o cliente
        </>
      )}
    </div>
  )
}
