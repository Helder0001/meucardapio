'use client'

// components/storefront/address-pin-picker.tsx
//
// Mapa de confirmação de endereço no checkout. Depois de rounds e rounds
// tentando fazer a geocodificação automática (Nominatim/OpenCage) acertar
// sozinha a casa exata do cliente, ficou claro que nenhuma API gratuita/
// barata tem numeração predial completa pras ruas do Brasil — o resultado
// pode vir "confiante" mas ainda assim errado (ver histórico de correções
// em lib/utils/geocode.ts e actions/orders/create-order.ts).
//
// Este componente resolve isso transferindo a decisão final pro cliente:
// mostra um mapa com um pino FIXO no centro da tela, e o cliente arrasta
// o MAPA por baixo dele (padrão iFood/Uber) até o pino ficar em cima da
// casa dele. A coordenada resultante é exata porque foi confirmada
// visualmente por quem sabe onde mora — não depende mais da qualidade dos
// dados da API de geocodificação.
//
// Renderizado via next/dynamic com ssr:false (Leaflet precisa de `window`),
// igual delivery-live-map.tsx.

import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface AddressPinPickerProps {
  /** Melhor estimativa inicial (do autocomplete/CEP) — só usada pra
   *  centralizar o mapa quando o endereço muda. Depois disso o cliente
   *  quem manda na posição. */
  seedLat: number
  seedLng: number
  onChange: (lat: number, lng: number) => void
}

// Recentraliza o mapa quando a estimativa inicial muda (nova rua/CEP
// buscado) — mas só reage à MUDANÇA da estimativa, nunca ao arrasto do
// cliente (que é reportado separadamente via onChange, sem realimentar
// esse componente — ver observação no cart-drawer.tsx).
function RecenterOnSeedChange({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], 17)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng])
  return null
}

function CenterTracker({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  const map = useMapEvents({
    moveend() {
      const c = map.getCenter()
      onMove(c.lat, c.lng)
    },
  })
  return null
}

export function AddressPinPicker({ seedLat, seedLng, onChange }: AddressPinPickerProps) {
  return (
    <div className="space-y-1.5">
      <div className="relative h-56 rounded-xl overflow-hidden border border-border z-0">
        <MapContainer
          center={[seedLat, seedLng]}
          zoom={17}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecenterOnSeedChange lat={seedLat} lng={seedLng} />
          <CenterTracker onMove={onChange} />
        </MapContainer>

        {/* Pino fixo no centro da tela — o cliente arrasta o mapa por
            baixo, não o pino. Evita o dedo tampar o alvo no celular. */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-[1000]"
          style={{ transform: 'translate(-50%, -100%)' }}
        >
          <span style={{ fontSize: 36, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.4))' }}>📍</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        📍 Arraste o mapa até o pino ficar bem em cima da sua casa
      </p>
    </div>
  )
}
