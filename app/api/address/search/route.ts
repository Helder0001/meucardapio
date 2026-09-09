// app/api/address/search/route.ts
//
// CORREÇÃO (#3): a busca de endereço de entrega só existia por CEP — pra
// quem não sabe o próprio CEP de cabeça, isso é uma barreira real (a
// alternativa era "usar minha localização", que exige permissão de GPS
// e nem sempre está disponível/precisa). Esta rota permite buscar pelo
// nome da rua em texto livre, igual um autocomplete de endereço.
//
// Usa o Nominatim (OpenStreetMap) — mesma fonte já usada em
// lib/utils/geocode.ts para o mapa de rastreamento — gratuito, sem
// exigir uma API key nova (diferente do Google Places Autocomplete).

import { NextRequest, NextResponse } from 'next/server'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

interface AddressResult {
  label: string       // ex: "Rua Ana Batista, 55, Jardim Iracema, Fortaleza - CE"
  logradouro: string
  numero: string
  bairro: string
  localidade: string
  uf: string
  cep: string | null
  // CORREÇÃO: o Nominatim já retorna a coordenada exata deste resultado
  // específico (rua + número, quando ele tem o número). Antes isso era
  // descartado e o pedido era geocodificado de novo, a partir do texto,
  // na hora da entrega — podendo cair num ponto aproximado da rua em vez
  // do imóvel certo. Guardando aqui, o cliente escolhe uma sugestão e a
  // coordenada dela vai junto, sem precisar geocodificar de novo depois.
  lat: number | null
  lng: number | null
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  // Cidade/UF do tenant (opcional) — melhora a relevância dos resultados
  // quando o nome da rua sozinho é ambíguo (existe em várias cidades).
  const cityHint = req.nextUrl.searchParams.get('city')?.trim() ?? ''

  if (query.length < 4) {
    return NextResponse.json({ results: [] })
  }

  try {
    const url = new URL(NOMINATIM_URL)
    const fullQuery = cityHint ? `${query}, ${cityHint}, Brasil` : `${query}, Brasil`
    url.searchParams.set('q', fullQuery)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('countrycodes', 'br')
    url.searchParams.set('limit', '5')

    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim exige um User-Agent identificável — não remover.
        'User-Agent': 'MeuCardapio/1.0 (contato@meucardapio.app)',
        'Accept-Language': 'pt-BR',
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return NextResponse.json({ results: [] })
    }

    const raw = await res.json()
    if (!Array.isArray(raw)) {
      return NextResponse.json({ results: [] })
    }

    const results: AddressResult[] = raw
      .map((item: any): AddressResult | null => {
        const addr = item.address ?? {}
        const logradouro = addr.road || addr.pedestrian || ''
        // Endereços sem nome de rua identificável (ex: só um bairro ou
        // cidade genérica) não ajudam quem está buscando uma rua.
        if (!logradouro) return null

        const bairro     = addr.suburb || addr.neighbourhood || addr.city_district || ''
        const localidade = addr.city || addr.town || addr.municipality || ''
        const uf          = addr.state_code?.toUpperCase() || addr.state || ''
        const numero      = addr.house_number || ''

        const label = [
          numero ? `${logradouro}, ${numero}` : logradouro,
          bairro,
          localidade && uf ? `${localidade} - ${uf}` : localidade,
        ].filter(Boolean).join(', ')

        const lat = item.lat != null ? parseFloat(item.lat) : NaN
        const lng = item.lon != null ? parseFloat(item.lon) : NaN

        return {
          label, logradouro, numero, bairro, localidade, uf,
          cep: addr.postcode ?? null,
          lat: Number.isNaN(lat) ? null : lat,
          lng: Number.isNaN(lng) ? null : lng,
        }
      })
      .filter((r): r is AddressResult => r !== null)
      // Nominatim às vezes devolve a mesma rua repetida com pequenas
      // variações de número — mantém só a primeira ocorrência do nome.
      .filter((r, i, arr) => arr.findIndex((x) => x.logradouro === r.logradouro && x.bairro === r.bairro) === i)

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[address/search] erro:', err)
    return NextResponse.json({ results: [] })
  }
}
