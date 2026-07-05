// lib/mercadopago/checkout-client.ts
//
// Funções para gerar cobranças via Mercado Pago:
//
// 1. createPaymentPreference — Checkout Pro (link de pagamento)
//    Gera um link que o cliente abre no próprio celular e paga com qualquer
//    método (PIX, crédito, débito). Usado para:
//    - Link enviado via WhatsApp pelo garçom (pedidos de mesa/balcão)
//    - Checkout no cardápio digital (redirect para página segura do MP)
//
// 2. createCardPayment — Checkout Transparente
//    O cliente digita o cartão diretamente no storefront (via MP.js que
//    tokeniza os dados no browser). O card_token chega no servidor já
//    tokenizado — nunca os dados reais do cartão.
//    Usado para: checkout inline no cardápio digital (sem redirect)
//
// Documentação:
// - Checkout Pro: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro
// - Checkout Transparente: https://www.mercadopago.com.br/developers/pt/docs/checkout-api

import { resolveTenantMpAccessToken } from './resolve-token'

const MP_API = 'https://api.mercadopago.com'

// ── Checkout Pro (link de pagamento) ─────────────────────────────────────────

export interface PreferenceItem {
  title: string
  quantity: number
  unit_price: number
  currency_id?: string
}

export interface CreatePreferenceParams {
  tenantId: string
  orderId: string
  orderNumber: number
  items: PreferenceItem[]
  total: number
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  // URL para onde o MP redireciona após o pagamento (sucesso/falha/pending)
  backUrls?: {
    success?: string
    failure?: string
    pending?: string
  }
  // Se true, redireciona automaticamente sem esperar o cliente clicar
  autoReturn?: 'approved' | 'all'
  expirationMinutes?: number // padrão: 30 min
}

export interface PreferenceResult {
  preferenceId: string
  checkoutUrl: string     // init_point (produção)
  sandboxUrl: string      // sandbox_init_point (teste)
}

export async function createPaymentPreference(
  params: CreatePreferenceParams
): Promise<PreferenceResult> {
  const accessToken = await resolveTenantMpAccessToken(params.tenantId)
  if (!accessToken) throw new Error('Mercado Pago não configurado para este restaurante')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const expiresAt = new Date(Date.now() + (params.expirationMinutes ?? 30) * 60 * 1000)

  const body = {
    items: params.items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      unit_price: Number(item.unit_price.toFixed(2)),
      currency_id: item.currency_id ?? 'BRL',
    })),
    payer: {
      name: params.customerName,
      email: params.customerEmail ?? 'comprador@meucardapio.com',
      phone: params.customerPhone
        ? { area_code: params.customerPhone.replace(/\D/g, '').slice(0, 2), number: params.customerPhone.replace(/\D/g, '').slice(2) }
        : undefined,
    },
    external_reference: params.orderId,
    statement_descriptor: 'MeuCardapio',
    notification_url: `${appUrl}/api/webhooks/mercadopago`,
    back_urls: {
      success: params.backUrls?.success ?? `${appUrl}/menu/pedido/${params.orderId}?status=success`,
      failure: params.backUrls?.failure ?? `${appUrl}/menu/pedido/${params.orderId}?status=failure`,
      pending: params.backUrls?.pending ?? `${appUrl}/menu/pedido/${params.orderId}?status=pending`,
    },
    auto_return: params.autoReturn ?? 'approved',
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: expiresAt.toISOString(),
    metadata: {
      order_id: params.orderId,
      order_number: params.orderNumber,
      tenant_id: params.tenantId,
    },
  }

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      // A chave de idempotência inclui o total: assim, chamadas repetidas com o
      // MESMO valor reaproveitam a preference (evita duplicar em clique duplo),
      // mas depois de editar o pedido (total mudou) o MP gera uma preference
      // NOVA em vez de devolver a antiga com o valor desatualizado.
      'X-Idempotency-Key': `pref-${params.orderId}-${params.total.toFixed(2)}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`MP Preference error (${res.status}): ${err}`)
  }

  const data = await res.json()
  return {
    preferenceId: data.id,
    checkoutUrl: data.init_point,
    sandboxUrl: data.sandbox_init_point,
  }
}

// ── Checkout Transparente (cartão tokenizado) ────────────────────────────────

export interface CreateCardPaymentParams {
  tenantId: string
  orderId: string
  amount: number
  cardToken: string          // gerado pelo MP.js no browser — nunca os dados reais
  installments: number       // número de parcelas (1 = à vista)
  paymentMethodId: string    // ex: 'visa', 'mastercard', 'elo'
  issuerId?: string          // emissor do cartão (se disponível pelo MP.js)
  customerEmail: string
  customerCpf: string        // obrigatório pelo MP para cartão — CPF ou CNPJ
  customerDocumentType?: 'CPF' | 'CNPJ'  // CORREÇÃO: era sempre CPF, ignorando CNPJ
  customerName: string
  description?: string
}

export interface CardPaymentResult {
  mercadoPagoId: string
  status: 'approved' | 'pending' | 'rejected' | 'in_process'
  statusDetail: string
  cardLastDigits?: string
  cardBrand?: string
  installments: number
  // Somente se 'approved'
  approvedAt?: string
}

export async function createCardPayment(
  params: CreateCardPaymentParams
): Promise<CardPaymentResult> {
  const accessToken = await resolveTenantMpAccessToken(params.tenantId)
  if (!accessToken) throw new Error('Mercado Pago não configurado para este restaurante')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const body = {
    transaction_amount: Number(params.amount.toFixed(2)),
    token: params.cardToken,
    installments: params.installments,
    payment_method_id: params.paymentMethodId,
    issuer_id: params.issuerId,
    payer: {
      email: params.customerEmail,
      identification: {
        type: params.customerDocumentType ?? 'CPF',
        number: params.customerCpf.replace(/\D/g, ''),
      },
    },
    description: params.description ?? `Pedido #${params.orderId.slice(-8).toUpperCase()}`,
    external_reference: params.orderId,
    notification_url: `${appUrl}/api/webhooks/mercadopago`,
    metadata: {
      order_id: params.orderId,
      tenant_id: params.tenantId,
    },
  }

  const res = await fetch(`${MP_API}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `card-${params.orderId}-${params.cardToken.slice(-8)}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(`MP Card Payment error (${res.status}): ${data.message ?? JSON.stringify(data)}`)
  }

  return {
    mercadoPagoId: String(data.id),
    status: data.status,
    statusDetail: data.status_detail,
    cardLastDigits: data.card?.last_four_digits,
    cardBrand: data.payment_method_id,
    installments: data.installments ?? params.installments,
    approvedAt: data.date_approved,
  }
}
