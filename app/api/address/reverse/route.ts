// app/api/address/reverse/route.ts
//
// Geocodificação reversa (coordenadas → endereço em texto), usada pela
// opção "Usar minha localização" no checkout — o cliente compartilha o
// GPS do celular e a gente converte pra rua/bairro/cidade, do mesmo jeito
// que a busca por nome de rua já preenche esses campos.
//
// A COORDENADA em si (mais precisa que qualquer geocodificação de texto,
// já que veio direto do GPS do cliente) é usada como estava — só o texto
// do endereço vem desta rota. Mesmo provedor da busca por rua (Nominatim),
// sem precisar de chave nova.

import { NextRequest, NextResponse } from 'next/server'

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 })
  }

  try {
    const url = new URL(NOMINATIM_REVERSE_URL)
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('zoom', '18') // nível de rua/imóvel

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'MeuCardapio/1.0 (contato@meucardapio.app)',
        'Accept-Language': 'pt-BR',
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return NextResponse.json({ result: null })
    }

    const item = await res.json()
    const addr = item?.address ?? {}
    const logradouro = addr.road || addr.pedestrian || ''

    if (!logradouro) {
      return NextResponse.json({ result: null })
    }

    const bairro     = addr.suburb || addr.neighbourhood || addr.city_district || ''
    const localidade = addr.city || addr.town || addr.municipality || ''
    const uf          = addr.state_code?.toUpperCase() || addr.state || ''
    const numero      = addr.house_number || ''

    const label = [
      numero ? `${logradouro}, ${numero}` : logradouro,
      bairro,
      localidade && uf ? `${localidade} - ${uf}` : localidade,
    ].filter(Boolean).join(', ')

    return NextResponse.json({
      result: { label, logradouro, numero, bairro, localidade, uf, cep: addr.postcode ?? null },
    })
  } catch (err) {
    console.error('[address/reverse] erro:', err)
    return NextResponse.json({ result: null })
  }
}
