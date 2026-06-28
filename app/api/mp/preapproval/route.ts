// app/api/mp/preapproval/route.ts
// API Route dedicada para criar preapproval no Mercado Pago
// Separada do Server Action para suportar maxDuration > 10s
//
// Plano único PRO — R$1,00/mês (teste) | R$10,80/ano (R$1 × 12 - 10%)
// Para produção, ajuste PLAN_PRICE_MONTHLY e PLAN_PRICE_ANNUAL.

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// ── Preços ────────────────────────────────────────────────────────────────────
// Valor mensal em R$ (para testes = 1,00)
const PLAN_PRICE_MONTHLY = 1.00
// Valor anual = mensal × 12 - 10% (cobrado como parcela única anual)
const PLAN_PRICE_ANNUAL  = parseFloat((PLAN_PRICE_MONTHLY * 12 * 0.9).toFixed(2))

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

  const { reason, payer_email, card_token_id, payer, billing_cycle } = body

  if (!payer_email) {
    return NextResponse.json({ error: 'Dados obrigatórios ausentes' }, { status: 400 })
  }

  // billing_cycle: 'MONTHLY' | 'ANNUAL'
  const isAnnual     = billing_cycle === 'ANNUAL'
  const amount       = isAnnual ? PLAN_PRICE_ANNUAL : PLAN_PRICE_MONTHLY
  const frequency    = 1
  const frequencyType = isAnnual ? 'years' : 'months'

  // Trial de 7 dias: cobrança começa após o trial
  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  // ── PIX recorrente (sem card_token_id) ────────────────────────────────────
  // Se não vier token de cartão, criar preapproval sem card_token — o MP
  // enviará link de pagamento PIX para o e-mail do cliente.
  const isPixPayment = !card_token_id

  const mpPayload: Record<string, any> = {
    reason: reason ?? `Meu Cardápio — Plano PRO ${isAnnual ? 'Anual' : 'Mensal'}`,
    payer_email,
    auto_recurring: {
      frequency,
      frequency_type: frequencyType,
      transaction_amount: amount,
      currency_id: 'BRL',
    },
    start_date: startDate.toISOString(),
    back_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    status: 'pending', // 'pending' primeiro; depois PUT com card_token para 'authorized'
    payer,
  }

  if (!isPixPayment) {
    mpPayload.card_token_id = card_token_id
    mpPayload.status = 'authorized'
  }

  console.log('[mp/preapproval] payload:', JSON.stringify({
    ...mpPayload,
    card_token_id: card_token_id ? `${card_token_id.slice(0, 8)}...` : null,
  }))

  let rawText = ''
  try {
    // Passo 1: POST com status 'pending'
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
      const msg: string    = data?.message ?? data?.error ?? 'Erro ao processar pagamento'
      const causes: string = JSON.stringify(data?.cause ?? data?.causes ?? '')
      console.error('[mp/preapproval] erro MP:', JSON.stringify(data))

      if (msg.includes('CC_VAL_433') || causes.includes('CC_VAL_433')) {
        return NextResponse.json({ error: 'Dados do cartão inválidos. Verifique e tente novamente.' }, { status: 400 })
      }
      if (msg.includes('cc_rejected') || msg.includes('rejected')) {
        return NextResponse.json({ error: 'Cartão recusado. Verifique os dados ou use outro cartão.' }, { status: 400 })
      }
      if (msg.includes('invalid') || msg.includes('Invalid')) {
        return NextResponse.json({ error: 'Dados inválidos. Verifique e tente novamente.' }, { status: 400 })
      }

      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const subscriptionId = String(data.id)

    // Passo 2: se cartão, fazer PUT para 'authorized' com card_token
    if (!isPixPayment) {
      const putRes = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `authorize-${subscriptionId}`,
        },
        body: JSON.stringify({ card_token_id, status: 'authorized' }),
      })
      const putText = await putRes.text()
      console.log('[mp/preapproval] PUT authorize status:', putRes.status, putText)
      // Não bloquear o fluxo se o PUT falhar — o webhook vai atualizar depois
    }

    return NextResponse.json({
      subscriptionId,
      billingCycle: isAnnual ? 'ANNUAL' : 'MONTHLY',
      amount,
      paymentMethod: isPixPayment ? 'PIX' : 'CARD',
      // PIX: link para o pagador efetuar o primeiro pagamento
      pixInitPoint: isPixPayment ? data?.init_point : undefined,
    })
  } catch (err: any) {
    console.error('[mp/preapproval] fetch error:', err)
    return NextResponse.json({ error: 'Erro ao conectar ao Mercado Pago. Tente novamente.' }, { status: 502 })
  }
}
