// app/api/mp/preapproval/route.ts
// API Route dedicada para criar preapproval no Mercado Pago
// Separada do Server Action para suportar maxDuration > 10s

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) {
    console.error('[mp/preapproval] MERCADOPAGO_ACCESS_TOKEN não configurado')
    return NextResponse.json({ error: 'MP não configurado' }, { status: 500 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { reason, payer_email, card_token_id, payer } = body

  if (!card_token_id || !payer_email) {
    return NextResponse.json({ error: 'Dados obrigatórios ausentes' }, { status: 400 })
  }

  // Trial de 7 dias via start_date atrasado
  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const mpPayload = {
    reason,
    payer_email,
    card_token_id,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 49.00,
      currency_id: 'BRL',
    },
    start_date: startDate.toISOString(),
    back_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    status: 'authorized',
    payer,
  }

  console.log('[mp/preapproval] payload:', JSON.stringify({
    ...mpPayload,
    card_token_id: card_token_id ? `${card_token_id.slice(0, 8)}...` : null,
  }))

  let rawText = ''
  try {
    const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `register-${payer_email}-${Date.now()}`,
      },
      body: JSON.stringify(mpPayload),
    })

    rawText = await mpRes.text()
    console.log('[mp/preapproval] response status:', mpRes.status, 'body:', rawText)

    let data: any = {}
    try {
      data = JSON.parse(rawText)
    } catch {
      console.error('[mp/preapproval] body não é JSON:', rawText)
      return NextResponse.json({ error: 'Resposta inesperada do Mercado Pago' }, { status: 502 })
    }

    if (!mpRes.ok || !data?.id) {
      const msg: string = data?.message ?? data?.error ?? 'Erro ao processar cartão'
      const causes: string = JSON.stringify(data?.cause ?? data?.causes ?? '')
      console.error('[mp/preapproval] erro MP:', JSON.stringify(data))

      if (msg.includes('CC_VAL_433') || causes.includes('CC_VAL_433')) {
        return NextResponse.json({ error: 'Dados do cartão inválidos. Verifique e tente novamente.' }, { status: 400 })
      }
      if (msg.includes('cc_rejected') || msg.includes('rejected')) {
        return NextResponse.json({ error: 'Cartão recusado. Verifique os dados ou use outro cartão.' }, { status: 400 })
      }
      if (msg.includes('invalid') || msg.includes('Invalid')) {
        return NextResponse.json({ error: 'Dados do cartão inválidos. Verifique e tente novamente.' }, { status: 400 })
      }

      return NextResponse.json({ error: msg }, { status: 400 })
    }

    return NextResponse.json({ subscriptionId: String(data.id) })
  } catch (err: any) {
    console.error('[mp/preapproval] fetch error:', err)
    return NextResponse.json({ error: 'Erro ao conectar ao Mercado Pago. Tente novamente.' }, { status: 502 })
  }
}
