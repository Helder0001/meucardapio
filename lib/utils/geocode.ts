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
//
// CORREÇÃO 2: as duas funções agora validam o NÍVEL do resultado antes de
// aceitar (confidence na OpenCage, addresstype no Nominatim). Sem isso,
// quando a rua/número não era encontrado com precisão, a API devolvia o
// centro do bairro ou da cidade — e o código aceitava isso como se fosse
// o endereço exato, plantando o pino longe do lugar certo. Agora, se só
// tem resultado de nível bairro/cidade pra cima, tratamos como "não
// encontrado" (retorna null) em vez de mostrar um pino errado.

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
  // CORREÇÃO: pedimos os 3 melhores resultados (antes só 1) e verificamos
  // o campo `confidence` de cada um. A OpenCage sempre retorna esse campo
  // (1 = ~25km de raio de incerteza, 10 = <0,5km/nível de prédio) mesmo
  // sem annotations. Antes o código aceitava cegamente o resultado #1 —
  // então quando a rua/número não batia com nada preciso, ela devolvia o
  // centro do BAIRRO (confidence baixo) e o app tratava isso como se
  // fosse a casa certa. Agora só aceitamos confidence >= 7 (nível de rua
  // ou melhor); abaixo disso, é melhor não mostrar pino nenhum do que
  // mostrar um errado.
  url.searchParams.set('limit', '3')
  url.searchParams.set('no_annotations', '1')
  if (anchor) {
    url.searchParams.set('proximity', `${anchor.lat},${anchor.lng}`)
  }

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) })
  if (!res.ok) return null

  const data = await res.json()
  const candidates = Array.isArray(data?.results) ? data.results : []
  const best = candidates.find((r: any) => typeof r?.confidence === 'number' && r.confidence >= 7)
  if (!best) return null

  const lat = best?.geometry?.lat
  const lng = best?.geometry?.lng
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
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '3')
  if (anchor) {
    // CORREÇÃO: estava bounded=0, que no Nominatim só "prioriza" a área da
    // viewbox mas NÃO restringe — se o texto batesse mal em outro lugar,
    // ele podia ignorar a âncora e devolver um ponto de outro bairro/cidade
    // (foi exatamente isso que aconteceu: endereço certo, resultado a
    // 1,8km, em outro bairro). Com bounded=1 e uma janela generosa (±0.5°,
    // ~55km), o resultado fica restrito à região da loja de verdade.
    const delta = 0.5
    url.searchParams.set(
      'viewbox',
      `${anchor.lng - delta},${anchor.lat + delta},${anchor.lng + delta},${anchor.lat - delta}`
    )
    url.searchParams.set('bounded', '1')
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
  const candidates = Array.isArray(results) ? results : []
  // CORREÇÃO: o Nominatim não tem um `confidence` numérico como a OpenCage,
  // mas o campo `addresstype` diz o nível do resultado ('house', 'road',
  // 'suburb', 'city'...). Sem checar isso, um resultado de nível de BAIRRO
  // era aceito como se fosse o endereço exato. Aceitamos só nível de rua
  // pra cima (house/building/road/residential/etc.) — nível de bairro/
  // cidade/estado é rejeitado; melhor sem pino do que com um errado.
  const broadTypes = new Set([
    'suburb', 'neighbourhood', 'quarter', 'city_district', 'city', 'town',
    'village', 'municipality', 'county', 'state', 'country', 'postcode',
  ])
  const best = candidates.find((r: any) => !broadTypes.has(r?.addresstype) && r?.lat && r?.lon)
  if (!best) return null

  const lat = parseFloat(best.lat)
  const lng = parseFloat(best.lon)
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
