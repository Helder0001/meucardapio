'use client'

// components/storefront/delivery-live-map.tsx
//
// Mapa com o percurso ao vivo do entregador — mostrado ao cliente na
// página de acompanhamento do pedido enquanto o status é "A caminho", e
// também na tela dedicada do entregador
// (components/dashboard/delivery-tracking-screen.tsx).
// Usa Leaflet + OpenStreetMap (gratuito, sem API key).
//
// Três marcadores possíveis (qualquer um pode faltar):
//   🏪 loja        — Tenant.latitude/longitude (cadastrado em Configurações)
//   🛵 entregador   — posição atual, atualizada a cada poll (ver order-tracking.tsx)
//   📍 destino      — endereço do cliente, geocodificado automaticamardo o
//                     pedido saiu para entrega
//
// `route`, se fornecido (via lib/utils/osrm.ts), desenha o traçado real da
// rota rodoviária entre origem e destino em vez de uma linha reta.
//
// Renderizado via next/dynamic com ssr:false (Leaflet precisa de `window`).

import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface LatLng { lat: number; lng: number }

interface DeliveryLiveMapProps {
  store: LatLng | null
  destination: LatLng | null
  courier: (LatLng & { updatedAt?: string | Date | null }) | null
  /** Traçado da rota (lib/utils/osrm.ts) — opcional, desenha a linha azul. */
  route?: [number, number][] | null
}

function emojiIcon(emoji: string, size = 32) {
  return L.divIcon({
    html: `<div style="font-size:${size * 0.6}px;line-height:${size}px;text-align:center;width:${size}px;height:${size}px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${emoji}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const storeIcon   = emojiIcon('🏪')
const homeIcon     = emojiIcon('📍')
const courierIcon  = emojiIcon('🛵', 36)

// Ajusta o zoom/centro automaticamente para enquadrar todos os pontos
// disponíveis sempre que algum deles mudar (ex.: entregador se move).
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15)
      return
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
  }, [map, JSON.stringify(points)])
  return null
}

export function DeliveryLiveMap({ store, destination, courier, route }: DeliveryLiveMapProps) {
  const points = useMemo(
    () => [store, destination, courier].filter((p): p is LatLng => !!p),
    [store, destination, courier]
  )

  const initialCenter: [number, number] = points[0]
    ? [points[0].lat, points[0].lng]
    : [-23.5505, -46.6333] // fallback: São Paulo, só até os pontos reais chegarem

  if (points.length === 0) {
    return (
      <div className="h-56 rounded-xl border border-border bg-muted flex items-center justify-center text-sm text-muted-foreground text-center px-4">
        🛵 Aguardando o entregador iniciar o compartilhamento da localização...
      </div>
    )
  }

  return (
    <div className="h-64 rounded-xl overflow-hidden border border-border relative z-0">
      <MapContainer
        center={initialCenter}
        zoom={14}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />

        {route && route.length > 1 && (
          <Polyline positions={route} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85 }} />
        )}

        {store && (
          <Marker position={[store.lat, store.lng]} icon={storeIcon}>
            <Popup>Loja</Popup>
          </Marker>
        )}
        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={homeIcon}>
            <Popup>Seu endereço</Popup>
          </Marker>
        )}
        {courier && (
          <Marker position={[courier.lat, courier.lng]} icon={courierIcon}>
            <Popup>Entregador — atualizado agora mesmo</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}
