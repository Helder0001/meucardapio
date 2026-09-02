// lib/utils/geocode.ts
//
// Geocodificação "best-effort" de endereços em texto livre usando o Nominatim
// (OpenStreetMap) — gratuito, sem API key. Usado só para posicionar o
// marcador de destino no mapa de rastreamento ao vivo do entregador; se
// falhar ou não achar nada, o mapa continua funcionando sem esse marcador.
//
// Respeitamos a política de uso do Nominatim: no máximo ~1 req/s e um
// User-Agent identificável. Como isso só roda esporadicamente (1x por
// pedido, com cache no banco), não há risco de estourar o limite.

interface GeoPoint { lat: number; lng: number }

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const query = address.trim()
  if (query.length < 5) return null

  try {
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('q', `${query}, Brasil`)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')

    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim exige um User-Agent identificável — não remover.
        'User-Agent': 'MeuCardapio/1.0 (contato@meucardapio.app)',
        'Accept-Language': 'pt-BR',
      },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null

    const results = await res.json()
    const first = Array.isArray(results) ? results[0] : null
    if (!first?.lat || !first?.lon) return null

    const lat = parseFloat(first.lat)
    const lng = parseFloat(first.lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null

    return { lat, lng }
  } catch (err) {
    console.error('[geocode] Falha ao geocodificar endereço:', err)
    return null
  }
}
