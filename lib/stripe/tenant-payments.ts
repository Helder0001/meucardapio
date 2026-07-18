// lib/stripe/tenant-payments.ts
//
// Cria cobranças pra pedidos dos TENANTS via Stripe (diferente do OAuth em
// si, que só autentica — isso aqui já cobra de verdade). Usa o modelo
// "Standard Connect direto": a cobrança é feita usando o PRÓPRIO
// access_token do tenant (obtido no OAuth), então o dinheiro cai direto na
// conta dele — a plataforma nunca vê o dinheiro passar, igual o MP.
//
// Optamos por Stripe Checkout (página hospedada pelo Stripe) em vez de
// PaymentIntents com UI própria: cobre Pix e cartão no mesmo fluxo, sem
// precisarmos construir/testar exibição de QR code ou tokenização de
// cartão específica do Stripe.js sem poder validar contra a API de
// verdade nesse ambiente.

interface CreateCheckoutSessionParams {
  accessToken: string // access_token do tenant (StripeConnection.accessTokenEnc, decriptado)
  amount: number // em reais
  description: string
  orderId: string
  successUrl: string
  cancelUrl: string
  methods: Array<'card' | 'pix'>
}

interface CheckoutSessionResult {
  sessionId: string
  checkoutUrl: string
}

export async function createStripeCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
  const body = new URLSearchParams()
  body.append('mode', 'payment')
  body.append('success_url', params.successUrl)
  body.append('cancel_url', params.cancelUrl)
  body.append('metadata[order_id]', params.orderId)
  params.methods.forEach((m, i) => body.append(`payment_method_types[${i}]`, m))
  body.append('line_items[0][quantity]', '1')
  body.append('line_items[0][price_data][currency]', 'brl')
  body.append('line_items[0][price_data][product_data][name]', params.description.slice(0, 250))
  body.append('line_items[0][price_data][unit_amount]', String(Math.round(params.amount * 100)))

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = await res.json()

  if (!res.ok) {
    console.error('[stripe][checkout] erro ao criar sessão', data)
    throw new Error(`[stripe][checkout] Falha ao criar sessão: ${JSON.stringify(data).slice(0, 500)}`)
  }

  return { sessionId: data.id, checkoutUrl: data.url }
}

/** Consulta uma Checkout Session pra saber se já foi paga (usado como fallback além do webhook). */
export async function getStripeCheckoutSession(accessToken: string, sessionId: string) {
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`[stripe][checkout] Falha ao consultar sessão: ${JSON.stringify(data).slice(0, 500)}`)
  }
  return data as { id: string; payment_status: string; status: string }
}
