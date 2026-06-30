// app/api/cep/[cep]/route.ts
//
// Proxy de busca de CEP — evita problemas de CORS no navegador.
// Tenta BrasilAPI primeiro, cai para ViaCEP se falhar.

import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cep: string }> }
) {
  const { cep } = await params
  const digits = cep.replace(/\D/g, '')

  if (digits.length !== 8) {
    return NextResponse.json({ error: 'CEP inválido' }, { status: 400 })
  }

  // Tenta BrasilAPI
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json({
        logradouro: data.street || '',
        bairro:     data.neighborhood || '',
        localidade: data.city || '',
        uf:         data.state || '',
      })
    }
  } catch (err) {
    console.error('[cep] BrasilAPI falhou:', err)
  }

  // Fallback: ViaCEP
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()
    if (!data.erro) {
      return NextResponse.json({
        logradouro: data.logradouro || '',
        bairro:     data.bairro || '',
        localidade: data.localidade || '',
        uf:         data.uf || '',
      })
    }
  } catch (err) {
    console.error('[cep] ViaCEP falhou:', err)
  }

  return NextResponse.json({ error: 'CEP não encontrado' }, { status: 404 })
}
