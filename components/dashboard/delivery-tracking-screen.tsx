'use client'

// components/dashboard/delivery-tracking-screen.tsx
//
// Tela dedicada do entregador para uma entrega em andamento: mapa com
// rota real (OSRM), distância/tempo estimado, botões de navegação externa
// (Google Maps / Waze) e os dois botões de transição de status que o
// entregador já podia fazer em outros lugares do dashboard ("Iniciar
// entrega" = OUT_FOR_DELIVERY, "Finalizar entrega" = DELIVERED) — aqui
// reunidos numa tela pensada pra ser usada durante a entrega em si.
//
// Fontes de dados reaproveitadas do que já existia:
//   - GET  /api/orders/[id]/status     → status atual + store/destination/courier
//     (mesmo endpoint que o cliente final usa pra ver o mapa, aceita
//     sessão de staff sem precisar de token)
//   - POST /api/delivery/location      → envia a posição GPS atual
//     (mesmo endpoint que components/dashboard/courier-location-tracker.tsx
//     já usa em segundo plano — aqui é chamado de novo, direto desta tela,
//     então a localização é enviada mesmo que o widget flutuante não
//     esteja montado nesta página)
//   - PATCH /api/orders/[id]/update-status → avança o status do pedido
//   - GET  /api/delivery/route         → calcula a rota via OSRM (novo)
//
// "Modo entrega": enquanto o status é OUT_FOR_DELIVERY, tenta manter a
// tela ligada com a Screen Wake Lock API. Isso funciona enquanto esta aba
// estiver em primeiro plano — não sobrevive a trocar de app ou bloquear o
// celular (limitação do navegador/SO, não tem como contornar só com
// código web).

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Navigation, MapPin, Store, Clock, Ruler,
  PlayCircle, CheckCircle2, AlertTriangle, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatOrderNumber } from '@/lib/utils/format'

const DeliveryLiveMap = dynamic(
  () => import('@/components/storefront/delivery-live-map').then((m) => m.DeliveryLiveMap),
  { ssr: false, loading: () => <div className="flex-1 bg-muted animate-pulse" /> }
)

interface LatLng { lat: number; lng: number }

interface DeliveryTrackingScreenProps {
  orderId: string
  orderNumber: number
  initialStatus: string
  addressLine: string | null
  bairro: string | null
  store: LatLng | null
  destination: LatLng | null
}

const SEND_LOCATION_INTERVAL_MS = 8_000
const RECALC_ROUTE_INTERVAL_MS  = 30_000
const POLL_STATUS_INTERVAL_MS   = 5_000

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h${m > 0 ? ` ${m}min` : ''}`
}

function googleMapsUrl(dest: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`
}

function wazeUrl(dest: LatLng): string {
  return `https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`
}

export function DeliveryTrackingScreen({
  orderId,
  orderNumber,
  initialStatus,
  addressLine,
  bairro,
  store,
  destination,
}: DeliveryTrackingScreenProps) {
  const router = useRouter()

  const [status, setStatus] = useState(initialStatus)
  const [courier, setCourier] = useState<(LatLng & { updatedAt?: string | null }) | null>(null)
  const [myPosition, setMyPosition] = useState<LatLng | null>(null)
  const [route, setRoute] = useState<{ distanceMeters: number; durationSeconds: number; coordinates: [number, number][] } | null>(null)
  const [gpsError, setGpsError] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const wakeLockRef = useRef<any>(null)
  const lastRouteFetchAt = useRef(0)

  const isActive = status === 'OUT_FOR_DELIVERY'
  const isDelivered = status === 'DELIVERED'

  // ── Wake Lock: tenta manter a tela ligada enquanto a entrega está em
  // andamento e esta aba está em primeiro plano. Funcionalidade opcional —
  // se o navegador não suportar (ex.: iOS < 16.4), simplesmente não faz
  // nada, sem quebrar o resto da tela.
  useEffect(() => {
    if (!isActive) {
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
      return
    }
    if (!('wakeLock' in navigator)) return

    let cancelled = false

    const requestLock = async () => {
      try {
        const lock = await (navigator as any).wakeLock.request('screen')
        if (cancelled) { lock.release().catch(() => {}); return }
        wakeLockRef.current = lock
      } catch {
        // Permissão negada, sem suporte, ou bateria em modo economia —
        // segue sem tela sempre ligada, não é crítico.
      }
    }

    requestLock()

    // O lock é liberado automaticamente quando a aba fica oculta — se o
    // entregador voltar pra esta aba, tenta pegar de novo.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') requestLock()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [isActive])

  // ── GPS: observa a posição continuamente enquanto a entrega está ativa
  // e envia pro servidor a cada ~8s (mesmo intervalo do widget flutuante
  // em courier-location-tracker.tsx).
  useEffect(() => {
    if (!isActive || !navigator.geolocation) return

    let lastSentAt = 0
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMyPosition(point)
        setGpsError(false)

        const now = Date.now()
        if (now - lastSentAt >= SEND_LOCATION_INTERVAL_MS) {
          lastSentAt = now
          fetch('/api/delivery/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, lat: point.lat, lng: point.lng }),
          }).catch(() => {})
        }
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [isActive, orderId])

  // ── Rota (OSRM): recalcula com um intervalo maior que o do GPS — não
  // precisamos de uma rota nova a cada 8s, só o suficiente pra acompanhar
  // o deslocamento. O servidor de demonstração do OSRM é gratuito, mas é
  // de uso leve — por isso o throttle aqui.
  const fetchRoute = useCallback(async (origin: LatLng | null) => {
    if (!destination) return
    const now = Date.now()
    if (now - lastRouteFetchAt.current < RECALC_ROUTE_INTERVAL_MS && route) return
    lastRouteFetchAt.current = now

    const params = new URLSearchParams({ orderId })
    if (origin) {
      params.set('lat', String(origin.lat))
      params.set('lng', String(origin.lng))
    }
    try {
      const res = await fetch(`/api/delivery/route?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.route) setRoute(data.route)
    } catch {}
  }, [orderId, destination, route])

  useEffect(() => {
    fetchRoute(myPosition ?? store)
  }, [myPosition, store]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll de status: mantém o mapa/estado sincronizado mesmo se o
  // entregador tiver duas abas abertas, ou se outra pessoa mudar o status.
  useEffect(() => {
    if (isDelivered) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status) setStatus(data.status)
        if (data.tracking?.courier) setCourier(data.tracking.courier)
      } catch {}
    }, POLL_STATUS_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [orderId, isDelivered])

  async function handleStatusChange(nextStatus: 'OUT_FOR_DELIVERY' | 'DELIVERED') {
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/update-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(data.error ?? 'Não foi possível atualizar o pedido.')
        return
      }
      setStatus(nextStatus)
      if (nextStatus === 'DELIVERED') {
        setTimeout(() => router.push('/dashboard/delivery/tracking'), 1200)
      }
    } catch {
      setActionError('Erro de conexão. Tente novamente.')
    } finally {
      setActionLoading(false)
    }
  }

  const mapCourier = myPosition
    ? { ...myPosition, updatedAt: new Date().toISOString() }
    : courier

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button
          onClick={() => router.push('/dashboard/delivery/tracking')}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-sm font-bold uppercase tracking-wide text-foreground truncate">
            {isDelivered ? 'Entrega concluída' : 'Entrega em andamento'}
          </h1>
          <p className="text-xs text-muted-foreground">Pedido {formatOrderNumber(orderNumber)}</p>
        </div>
      </div>

      {/* Mapa */}
      <div className="flex-1 relative min-h-0">
        <DeliveryLiveMap
          store={store}
          destination={destination}
          courier={mapCourier}
          route={route?.coordinates}
        />
      </div>

      {/* Painel inferior */}
      <div className="border-t border-border bg-card px-4 py-4 space-y-3 shrink-0">
        {addressLine && (
          <div className="flex items-start gap-2 text-sm text-foreground">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <span className="truncate">{addressLine}{bairro ? ` — ${bairro}` : ''}</span>
          </div>
        )}

        {route && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5" /> {formatDistance(route.distanceMeters)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> {formatDuration(route.durationSeconds)}
            </span>
          </div>
        )}

        {gpsError && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Ative a localização do navegador para compartilhar o trajeto com o cliente.
          </div>
        )}

        {actionError && (
          <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {actionError}
          </div>
        )}

        {/* Navegação externa — turn-by-turn de verdade fica por conta do
            Google Maps/Waze; nossa tela cuida só de mostrar a rota e
            compartilhar a posição com o cliente. */}
        {destination && !isDelivered && (
          <div className="grid grid-cols-2 gap-2">
            <a
              href={googleMapsUrl(destination)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              <Navigation className="h-4 w-4" /> Google Maps
            </a>
            <a
              href={wazeUrl(destination)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              <Navigation className="h-4 w-4" /> Waze
            </a>
          </div>
        )}

        {!isActive && !isDelivered && (
          <button
            onClick={() => handleStatusChange('OUT_FOR_DELIVERY')}
            disabled={actionLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Iniciar entrega
          </button>
        )}

        {isActive && (
          <button
            onClick={() => handleStatusChange('DELIVERED')}
            disabled={actionLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-60"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Finalizar entrega
          </button>
        )}

        {isDelivered && (
          <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
            <CheckCircle2 className="h-4 w-4" /> Pedido entregue!
          </div>
        )}

        {store && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
            <Store className="h-3 w-3" /> Ponto de partida: loja
          </div>
        )}
      </div>
    </div>
  )
}
