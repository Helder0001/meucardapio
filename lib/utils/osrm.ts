// lib/utils/osrm.ts
//
// Calcula rota (distância, tempo estimado e traçado) entre dois pontos
// usando o OSRM (Open Source Routing Machine) — gratuito, sem API key,
// mesmo espírito do Nominatim já usado em lib/utils/geocode.ts.
//
// Usamos o servidor de demonstração público (router.project-osrm.org).
// Ele é destinado a uso leve/avaliação, não a tráfego de produção pesado —
// para um volume de entregas maior no futuro, o recomendado é trocar
// OSRM_BASE_URL por uma instância própria (Docker, mesmo dataset OSM),
// sem precisar mudar nada além dessa constante.

export interface RoutePoint { lat: number; lng: number }

export interface RouteResult {
  distanceMeters: number
  durationSeconds: number
  /** Traçado da rota, já como [lat, lng] (pronto para o Leaflet). */
  coordinates: [number, number][]
}

const OSRM_BASE_URL = 'https://router.project-osrm.org'

export async function getDrivingRoute(from: RoutePoint, to: RoutePoint): Promise<RouteResult | null> {
  try {
    const url =
      `${OSRM_BASE_URL}/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null

    const data = await res.json()
    const route = data?.routes?.[0]
    if (!route) return null

    const coordinates: [number, number][] = Array.isArray(route.geometry?.coordinates)
      ? route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng])
      : []

    return {
      distanceMeters: route.distance ?? 0,
      durationSeconds: route.duration ?? 0,
      coordinates,
    }
  } catch (err) {
    console.error('[osrm] Falha ao calcular rota:', err)
    return null
  }
}
