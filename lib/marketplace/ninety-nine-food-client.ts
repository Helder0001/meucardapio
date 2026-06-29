// lib/marketplace/ninety-nine-food-client.ts
//
// Cliente de integração com o 99Food.
//
// O 99Food (antigo DiDi Food) não expõe um portal de auto-cadastro de
// desenvolvedor tão aberto quanto o iFood — a integração é feita pelo
// padrão aberto do setor "Open Delivery" (https://www.opendelivery.com.br),
// o mesmo usado por outros marketplaces brasileiros (Rappi, AiQFome etc).
//
// Diferenças-chave em relação ao iFood:
// - Autenticação: client_credentials com `AppShopID` (identifica a loja)
//   fazendo o papel de client_id E client_secret simultaneamente.
// - Não existe app "centralizado" oficial documentado publicamente: a
//   plataforma precisa solicitar à equipe comercial do 99Food a liberação
//   de um "slot de integração" por loja, e a autorização é feita pelo
//   lojista dentro do 99Food Admin (não é um redirect OAuth clássico).
// - O contrato de payload (Order, OrderItem, eventos) segue a especificação
//   pública Open Delivery — por isso os campos abaixo seguem esse padrão.
//
// IMPORTANTE: como o 99Food está em expansão acelerada no Brasil, confirme
// sempre a documentação vigente em developer-food.99app.com antes de ativar
// em produção — endpoints e exigências de homologação podem mudar.

import type {
  MarketplaceClient,
  NormalizedMarketplaceEvent,
  NormalizedMarketplaceOrder,
  OAuthTokenResult,
} from './types'

const NF_BASE_URL = process.env.NINETYNINE_FOOD_API_BASE_URL ?? 'https://openapi.didi-food.com/v4/opendelivery'

function assertCredentials(appShopId?: string) {
  if (!appShopId) {
    throw new Error(
      '99Food: AppShopID da loja não encontrado na conexão. ' +
      'Confirme que o tenant concluiu a autorização no 99Food Admin.'
    )
  }
}

async function nfFetch(path: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(`${NF_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  return res
}

function mapEventType(eventType: string): NormalizedMarketplaceEvent['type'] {
  switch (eventType) {
    case 'ORDER_PLACED':
    case 'order.created':
      return 'ORDER_PLACED'
    case 'ORDER_CONFIRMED':
    case 'order.confirmed':
      return 'ORDER_CONFIRMED'
    case 'ORDER_CANCELLED':
    case 'order.cancelled':
      return 'ORDER_CANCELLED'
    case 'ORDER_READY':
    case 'order.ready_for_pickup':
      return 'ORDER_READY'
    case 'ORDER_DISPATCHED':
    case 'order.dispatched':
      return 'ORDER_DISPATCHED'
    case 'ORDER_CONCLUDED':
    case 'order.concluded':
      return 'ORDER_CONCLUDED'
    default:
      return 'UNKNOWN'
  }
}

export const ninetyNineFoodClient: MarketplaceClient = {
  provider: 'NINETYNINE_FOOD',

  // params.appShopId faz o papel de clientId/clientSecret no Open Delivery
  // (ver instruções de configuração no 99Food Admin).
  async exchangeToken(params): Promise<OAuthTokenResult> {
    const appShopId = params.appShopId
    assertCredentials(appShopId)

    const res = await fetch(`${NF_BASE_URL}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: appShopId!,
        client_secret: appShopId!,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`99Food: falha ao obter token (${res.status}): ${errText}`)
    }

    const data = await res.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type ?? 'bearer',
      expiresInSeconds: Number(data.expires_in ?? 3600),
    }
  },

  async refreshToken(refreshToken): Promise<OAuthTokenResult> {
    // Open Delivery via client_credentials normalmente não usa refresh_token
    // tradicional — o token é apenas re-emitido com as mesmas credenciais.
    // Mantido aqui para satisfazer a interface comum; reemite do zero.
    const res = await fetch(`${NF_BASE_URL}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      throw new Error(`99Food: falha ao renovar token (${res.status})`)
    }

    const data = await res.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      tokenType: data.token_type ?? 'bearer',
      expiresInSeconds: Number(data.expires_in ?? 3600),
    }
  },

  async pollEvents(accessToken, merchantId): Promise<NormalizedMarketplaceEvent[]> {
    const res = await nfFetch(`/events/v1.0/polling?merchantId=${merchantId}`, accessToken)

    if (res.status === 204) return []
    if (!res.ok) {
      throw new Error(`99Food: polling falhou (${res.status})`)
    }

    const data = await res.json()
    const events = Array.isArray(data) ? data : data?.events ?? []

    return events.map((evt: any) => ({
      externalEventId: evt.id ?? evt.eventId,
      externalOrderId: evt.orderId,
      type: mapEventType(evt.type ?? evt.code),
      createdAt: evt.createdAt ?? new Date().toISOString(),
      raw: evt,
    }))
  },

  async acknowledgeEvents(accessToken, eventIds): Promise<void> {
    if (eventIds.length === 0) return
    const res = await nfFetch(`/events/v1.0/acknowledgment`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ eventIds }),
    })
    if (!res.ok && res.status !== 202) {
      throw new Error(`99Food: falha ao confirmar (ack) eventos (${res.status})`)
    }
  },

  async getOrder(accessToken, externalOrderId): Promise<NormalizedMarketplaceOrder> {
    const res = await nfFetch(`/orders/v1.0/${externalOrderId}`, accessToken)
    if (!res.ok) {
      throw new Error(`99Food: falha ao buscar pedido ${externalOrderId} (${res.status})`)
    }
    const data = await res.json()
    return normalizeNinetyNineFoodOrder(data)
  },

  async confirmOrder(accessToken, externalOrderId): Promise<void> {
    const res = await nfFetch(`/orders/v1.0/${externalOrderId}/confirm`, accessToken, {
      method: 'POST',
    })
    if (!res.ok && res.status !== 202) {
      throw new Error(`99Food: falha ao confirmar pedido ${externalOrderId} (${res.status})`)
    }
  },

  async cancelOrder(accessToken, externalOrderId, reason): Promise<void> {
    const res = await nfFetch(`/orders/v1.0/${externalOrderId}/cancel`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
    if (!res.ok && res.status !== 202) {
      throw new Error(`99Food: falha ao cancelar pedido ${externalOrderId} (${res.status})`)
    }
  },

  async dispatchOrder(accessToken, externalOrderId): Promise<void> {
    const res = await nfFetch(`/orders/v1.0/${externalOrderId}/dispatch`, accessToken, {
      method: 'POST',
    })
    if (!res.ok && res.status !== 202) {
      throw new Error(`99Food: falha ao despachar pedido ${externalOrderId} (${res.status})`)
    }
  },
}

// Converte o payload Open Delivery do 99Food para o formato neutro.
function normalizeNinetyNineFoodOrder(raw: any): NormalizedMarketplaceOrder {
  const items = (raw.items ?? []).map((item: any) => ({
    externalItemId: item.id,
    name: item.name,
    quantity: item.quantity ?? 1,
    unitPrice: Number(item.unitPrice?.value ?? item.unitPrice ?? 0),
    totalPrice: Number(item.totalPrice?.value ?? item.totalPrice ?? 0),
    notes: item.observations,
    addons: (item.optionGroups ?? []).flatMap((group: any) =>
      (group.options ?? []).map((opt: any) => ({
        name: opt.name,
        price: Number(opt.unitPrice?.value ?? opt.price ?? 0),
        quantity: opt.quantity ?? 1,
      }))
    ),
  }))

  const address = raw.delivery?.deliveryAddress

  return {
    provider: 'NINETYNINE_FOOD',
    externalOrderId: raw.id,
    externalDisplayId: raw.displayId ?? raw.shortId,
    externalMerchantId: raw.merchant?.id,
    customerName: raw.customer?.name,
    customerPhone: raw.customer?.phone,
    items,
    subtotal: Number(raw.total?.subTotal ?? 0),
    deliveryFee: Number(raw.total?.deliveryFee ?? 0),
    discountAmount: Number(raw.total?.discount ?? 0),
    total: Number(raw.total?.total ?? raw.total?.orderAmount ?? 0),
    deliveryAddress: address
      ? {
          street: address.streetName,
          number: address.streetNumber,
          complement: address.complement,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
          zipCode: address.postalCode,
          reference: address.reference,
          latitude: address.coordinates?.latitude,
          longitude: address.coordinates?.longitude,
        }
      : undefined,
    deliveredBy: raw.delivery?.mode === 'MERCHANT' ? 'MERCHANT' : 'MARKETPLACE',
    paymentMethod: raw.payment?.method,
    isPaidOnline: raw.payment?.prepaid === true,
    notes: raw.notes,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    rawPayload: raw,
  }
}
