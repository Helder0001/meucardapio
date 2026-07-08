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

  const { reason, payer_email, card_token_id, payer, billing_cycle, start_immediately } = body

  if (!payer_email) {
    return NextResponse.json({ error: 'Dados obrigatórios ausentes' }, { status: 400 })
  }

  const isAnnual      = billing_cycle === 'ANNUAL'
  const amount        = isAnnual ? PLAN_PRICE_ANNUAL : PLAN_PRICE_MONTHLY
  const frequencyType = isAnnual ? 'years' : 'months'
  const isPixPayment  = !card_token_id

  // Cadastro novo (trial de 7 dias): primeira cobrança só depois do trial.
  // Reativação (start_immediately=true): cobrar já, no ato — sem mais 7 dias
  // de acesso grátis embutidos na própria reativação.
  const startDate = start_immediately
    ? new Date(Date.now() + 60 * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  // Com card_token_id: a assinatura já nasce autorizada num único POST.
  // (O padrão antigo — POST pending + PUT/preapproval/{id} pra autorizar —
  // é rejeitado pelo Mercado Pago com "You cannot authorize a preapproval,
  // only the payer can": esse PUT só pode ser chamado pelo próprio pagador
  // via checkout, nunca pelo vendedor via API. Documentação oficial do MP
  // confirma que o correto é enviar card_token_id + status: "authorized"
  // já na criação.)
  // Sem card_token_id (fluxo legado de PIX no cadastro): mantém 'pending'.
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
    // Assinaturas não recebem webhook configurado no painel do MP ("Suas
    // integrações") — pra esse produto o notification_url TEM que ir aqui,
    // na criação, senão a gente nunca recebe subscription_preapproval nem
    // os pagamentos recorrentes seguintes.
    notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`,
    status: isPixPayment ? 'pending' : 'authorized',
    payer,
    ...(isPixPayment ? {} : { card_token_id }),
  }

  console.log('[mp/preapproval] payload:', JSON.stringify({
    ...mpPayload,
    card_token_id: card_token_id ? `${String(card_token_id).slice(0, 8)}...` : null,
  }))

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

    const rawText = await mpRes.text()
    let data: any = {}
    try {
      data = JSON.parse(rawText)
    } catch {
      console.error('[mp/preapproval] body não é JSON: ' + rawText.slice(0, 1500))
      return NextResponse.json({ error: 'Resposta inesperada do Mercado Pago' }, { status: 502 })
    }

    // Log enxuto com os campos que importam pra diagnosticar (o corpo bruto
    // completo pode passar do limite de tamanho de log da Vercel e sumir
    // silenciosamente — por isso não logamos rawText inteiro aqui).
    console.log('[mp/preapproval] response: ' + JSON.stringify({
      httpStatus: mpRes.status,
      id: data?.id ?? null,
      status: data?.status ?? null,
      status_detail: data?.status_detail ?? null,
      message: data?.message ?? null,
    }))

    // IMPORTANTE: pedimos status "authorized" no POST, mas o Mercado Pago
    // pode responder 200/201 com data.id presente e MESMO ASSIM devolver
    // status "pending" (a criação foi aceita, mas a autorização do cartão
    // não foi confirmada de fato). Sem essa checagem, a gente marcava a
    // assinatura como ativa no nosso banco sem o MP ter cobrado nada.
    if (!isPixPayment && data?.status !== 'authorized') {
      console.error('[mp/preapproval] cartão não autorizado apesar de HTTP 200: ' + JSON.stringify({
        id: data?.id, status: data?.status, status_detail: data?.status_detail,
      }))
      return NextResponse.json({
        error: `Cartão não autorizado (status: ${data?.status ?? 'desconhecido'}). Verifique os dados ou tente outro cartão.`,
      }, { status: 400 })
    }

    if (!mpRes.ok || !data?.id) {
      const msg: string    = data?.message ?? data?.error ?? 'Erro ao processar pagamento'
      const causes: string = JSON.stringify(data?.cause ?? data?.causes ?? '')
      console.error('[mp/preapproval] erro MP completo: ' + JSON.stringify(data))

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

    return NextResponse.json({
      subscriptionId,
      billingCycle:  isAnnual ? 'ANNUAL' : 'MONTHLY',
      amount,
      paymentMethod: isPixPayment ? 'PIX' : 'CARD',
      status: data.status,
      pixInitPoint:  isPixPayment ? data?.init_point : undefined,
    })
  } catch (err: any) {
    console.error('[mp/preapproval] fetch error: ' + String(err?.message ?? err))
    return NextResponse.json({ error: 'Erro ao conectar ao Mercado Pago. Tente novamente.' }, { status: 502 })
  }
}
