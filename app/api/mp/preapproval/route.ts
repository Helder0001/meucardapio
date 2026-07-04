// app/api/mp/preapproval/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { isValidInternalSecret } from '@/lib/security/internal-secret'

export const maxDuration = 60

const PLAN_PRICE_MONTHLY = 1.00
const PLAN_PRICE_ANNUAL  = parseFloat((PLAN_PRICE_MONTHLY * 12 * 0.9).toFixed(2))

// VULN-CRIT-05: esta rota chama a API do Mercado Pago com um card_token_id
// fornecido no corpo da requisição — sem nenhuma autenticação, era um
// endpoint aberto na internet que autoriza (ou rejeita) cobranças reais
// contra a conta MP da própria plataforma. Isso é exatamente o padrão de
// "card testing": um golpista usa um endpoint de pagamento de terceiros
// pra descobrir se um cartão roubado ainda é válido, sem gastar nada além
// da tentativa. Essa rota só é chamada pelo PRÓPRIO servidor (dentro de
// actions/auth/register.ts, via fetch interno) — nunca pelo navegador do
// usuário — então exigir um secret conhecido só por quem chama
// internamente fecha o acesso externo sem quebrar o fluxo de cadastro.
export async function POST(req: NextRequest) {
  if (!isValidInternalSecret(req.headers.get('x-internal-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const isAnnual      = billing_cycle === 'ANNUAL'
  const amount        = isAnnual ? PLAN_PRICE_ANNUAL : PLAN_PRICE_MONTHLY
  const frequencyType = isAnnual ? 'years' : 'months'
  const isPixPayment  = !card_token_id

  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  // SEMPRE status 'pending' no POST — o PUT vai autorizar o cartão
  const mpPayload: Record<string, any> = {
    reason: reason ?? `Meu Cardápio — Plano PRO ${isAnnual ? 'Anual' : 'Mensal'}`,
    payer_email,
    auto_recurring: {
      frequency: 1,
      frequency_type: frequencyType,
      transaction_amount: amount,
      currency_id: 'BRL',
    },
    start_date: startDate.toISOString(),
    back_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    status: 'pending',
    payer,
  }

  console.log('[mp/preapproval] payload:', JSON.stringify({
    ...mpPayload,
    card_token_id: card_token_id ? `${String(card_token_id).slice(0, 8)}...` : null,
  }))

  try {
    // Passo 1: POST com status pending (sempre)
    const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `register-${payer_email}-${Date.now()}`,
      },
      body: JSON.stringify(mpPayload),
    })

    const rawText = await mpRes.text()
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
      console.error('[mp/preapproval] erro MP completo:', JSON.stringify(data))

      if (causes.includes('CC_VAL_433') || msg.includes('CC_VAL_433')) {
        return NextResponse.json({ error: 'Dados do cartão inválidos. Verifique e tente novamente.' }, { status: 400 })
      }
      if (msg.includes('cc_rejected') || msg.includes('rejected') || causes.includes('rejected')) {
        return NextResponse.json({ error: 'Cartão recusado. Verifique os dados ou use outro cartão.' }, { status: 400 })
      }
      if (msg.includes('invalid') || msg.includes('Invalid') || causes.includes('invalid')) {
        return NextResponse.json({ error: 'Dados inválidos. Verifique e tente novamente.' }, { status: 400 })
      }

      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const subscriptionId = String(data.id)

    // Passo 2: se cartão, PUT para autorizar
    if (!isPixPayment) {
      try {
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
        console.log('[mp/preapproval] PUT authorize status:', putRes.status, 'body:', putText)

        if (!putRes.ok) {
          const putData = JSON.parse(putText)
          const putMsg = putData?.message ?? 'Erro ao autorizar cartão'
          console.error('[mp/preapproval] PUT authorize erro completo:', putText)
          // PUT falhou — cancela a preapproval criada e retorna erro
          return NextResponse.json({ error: `Cartão recusado: ${putMsg}` }, { status: 400 })
        }
      } catch (putErr) {
        console.error('[mp/preapproval] PUT authorize error:', putErr)
        return NextResponse.json({ error: 'Erro ao autorizar cartão. Tente novamente.' }, { status: 502 })
      }
    }

    return NextResponse.json({
      subscriptionId,
      billingCycle:  isAnnual ? 'ANNUAL' : 'MONTHLY',
      amount,
      paymentMethod: isPixPayment ? 'PIX' : 'CARD',
      pixInitPoint:  isPixPayment ? data?.init_point : undefined,
    })
  } catch (err: any) {
    console.error('[mp/preapproval] fetch error:', err)
    return NextResponse.json({ error: 'Erro ao conectar ao Mercado Pago. Tente novamente.' }, { status: 502 })
  }
}
