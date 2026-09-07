// lib/utils/geocode.ts
//
// Geocodificação "best-effort" de endereços em texto livre. Usado só para
// posicionar o marcador de destino no mapa de rastreamento ao vivo do
// entregador; se falhar ou não achar nada, o mapa continua funcionando
// sem esse marcador.
//
// CORREÇÃO: trocado de Nominatim (OpenStreetMap) para OpenCage — o
// Nominatim, além de só ter dado de numeração de casa em parte das ruas
// do Brasil (retornando um ponto aproximado da rua quando não tem),
// também não tem um parâmetro de proximidade tão direto quanto o
// `proximity` da OpenCage. Se `OPENCAGE_API_KEY` não estiver configurada,
// cai automaticamente de volta pro Nominatim gratuito (não quebra quem
// ainda não configurou a chave).

interface GeoPoint { lat: number; lng: number }

const OPENCAGE_URL = 'https://api.opencagedata.com/geocode/v1/json'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

async function geocodeWithOpenCage(
  query: string,
  apiKey: string,
  anchor?: { lat: number; lng: number } | null
): Promise<GeoPoint | null> {
  const url = new URL(OPENCAGE_URL)
  url.searchParams.set('q', `${query}, Brasil`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('countrycode', 'br')
  url.searchParams.set('language', 'pt')
  url.searchParams.set('limit', '1')
  url.searchParams.set('no_annotations', '1')
  if (anchor) {
    url.searchParams.set('proximity', `${anchor.lat},${anchor.lng}`)
  }

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) })
  if (!res.ok) return null

  const data = await res.json()
  const first = Array.isArray(data?.results) ? data.results[0] : null
  const lat = first?.geometry?.lat
  const lng = first?.geometry?.lng
  if (typeof lat !== 'number' || typeof lng !== 'number') return null

  return { lat, lng }
}

async function geocodeWithNominatim(
  query: string,
  anchor?: { lat: number; lng: number } | null
): Promise<GeoPoint | null> {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('q', `${query}, Brasil`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  if (anchor) {
    const delta = 0.5
    url.searchParams.set(
      'viewbox',
      `${anchor.lng - delta},${anchor.lat + delta},${anchor.lng + delta},${anchor.lat - delta}`
    )
    url.searchParams.set('bounded', '0')
  }

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
}

// `anchor` (opcional): localização da loja (Configurações → Localização
// da loja) — dá prioridade a resultados perto dela, evitando confundir
// nomes de rua comuns com a mesma rua em outra cidade.
export async function geocodeAddress(
  address: string,
  anchor?: { lat: number; lng: number } | null
): Promise<GeoPoint | null> {
  const query = address.trim()
  if (query.length < 5) return null

  try {
    const apiKey = process.env.OPENCAGE_API_KEY
    if (apiKey) {
      return await geocodeWithOpenCage(query, apiKey, anchor)
    }
    return await geocodeWithNominatim(query, anchor)
  } catch (err) {
    console.error('[geocode] Falha ao geocodificar endereço:', err)
    return null
  }
}
