// lib/marketplace/ifood-client.ts
//
// Cliente da Merchant API do iFood.
// Documentação: https://developer.ifood.com.br
//
// MODELO DE APP: "Centralizado" — um único clientId/clientSecret da
// PLATAFORMA acessa todas as lojas (merchants) que autorizaram o app.
// O lojista nunca vê nem manuseia essas credenciais.
//
// Fluxo de autorização usado pelo iFood para apps centralizados é o
// "Authorization Code" simplificado: o parceiro gera um link com um
// authorizationCodeVerifier, o lojista loga no Portal do Parceiro e
// autoriza, o iFood devolve um authorizationCode que é trocado por token.
//
// Pontos importantes respeitados aqui (ver guias oficiais):
// - Confirmar pedido em até 8 minutos (CONFIRMATION_DEADLINE)
// - Sempre enviar acknowledgment dos eventos processados
// - Polling a cada 30s é o mínimo esperado p/ loja não cair como offline
// - Rate limit: 20 req/seg nos endpoints principais — chamadas aqui não
//   implementam retry agressivo; quem agenda o polling deve respeitar isso.

import type {
  MarketplaceClient,
  NormalizedMarketplaceEvent,
  NormalizedMarketplaceOrder,
  OAuthTokenResult,
} from './types'

const IFOOD_BASE_URL = process.env.IFOOD_API_BASE_URL ?? 'https://merchant-api.ifood.com.br'

const IFOOD_CLIENT_ID = process.env.IFOOD_CLIENT_ID
const IFOOD_CLIENT_SECRET = process.env.IFOOD_CLIENT_SECRET

function assertCredentials() {
  if (!IFOOD_CLIENT_ID || !IFOOD_CLIENT_SECRET) {
    throw new Error(
      'IFOOD_CLIENT_ID / IFOOD_CLIENT_SECRET não configurados. ' +
      'Essas credenciais são da PLATAFORMA (obtidas após homologação no Portal do Parceiro iFood), ' +
      'nunca do restaurante individual.'
    )
  }
}

async function ifoodFetch(path: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(`${IFOOD_BASE_URL}${path}`, {
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

// Mapeia o "fullCode" do evento do iFood para o tipo neutro usado no resto do sistema.
function mapEventCode(fullCode: string): NormalizedMarketplaceEvent['type'] {
  switch (fullCode) {
    case 'PLACED':
      return 'ORDER_PLACED'
    case 'CONFIRMED':
      return 'ORDER_CONFIRMED'
    case 'CANCELLED':
      return 'ORDER_CANCELLED'
    case 'CANCELLATION_REQUESTED':
    case 'HANDSHAKE_DISPUTE':
      return 'ORDER_CANCELLATION_REQUESTED'
    case 'READY_TO_PICKUP':
      return 'ORDER_READY'
    case 'DISPATCHED':
      return 'ORDER_DISPATCHED'
    case 'CONCLUDED':
      return 'ORDER_CONCLUDED'
    case 'ASSIGN_DRIVER':
      return 'DRIVER_ASSIGNED'
    default:
      return 'UNKNOWN'
  }
}

export const ifoodClient: MarketplaceClient = {
  provider: 'IFOOD',

  // Apps centralizados do iFood usam o fluxo client_credentials para o
  // token "de aplicação"; a permissão por loja específica vem de uma troca
  // adicional (authorizationCode) feita uma única vez no momento da conexão.
  // Aqui cobrimos os dois casos: se vier `authorizationCode`, troca por
  // token de usuário; senão, faz o client_credentials padrão.
  async exchangeToken(params): Promise<OAuthTokenResult> {
    assertCredentials()

    const body = new URLSearchParams({
      grantType: params.authorizationCode ? 'authorization_code' : 'client_credentials',
      clientId: IFOOD_CLIENT_ID!,
      clientSecret: IFOOD_CLIENT_SECRET!,
      ...(params.authorizationCode
        ? {
            authorizationCode: params.authorizationCode,
            authorizationCodeVerifier: params.authorizationCodeVerifier ?? '',
          }
        : {}),
    })

    const res = await fetch(`${IFOOD_BASE_URL}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`iFood: falha ao obter token (${res.status}): ${errText}`)
    }

    const data = await res.json()
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenType: data.type ?? 'bearer',
      expiresInSeconds: Number(data.expiresIn ?? 3600),
    }
  },

  async refreshToken(refreshToken): Promise<OAuthTokenResult> {
    assertCredentials()

    const body = new URLSearchParams({
      grantType: 'refresh_token',
      clientId: IFOOD_CLIENT_ID!,
      clientSecret: IFOOD_CLIENT_SECRET!,
      refreshToken,
    })

    const res = await fetch(`${IFOOD_BASE_URL}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`iFood: falha ao renovar token (${res.status}): ${errText}`)
    }

    const data = await res.json()
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? refreshToken,
      tokenType: data.type ?? 'bearer',
      expiresInSeconds: Number(data.expiresIn ?? 3600),
    }
  },

  async pollEvents(accessToken, merchantId): Promise<NormalizedMarketplaceEvent[]> {
    // excludeHeartbeat evita marcar a loja como aberta/fechada indevidamente
    // (relevante sobretudo para integradores logísticos — mantido por segurança)
    const res = await ifoodFetch(
      `/order/v1.0/events:polling?excludeHeartbeat=true`,
      accessToken,
      {
        headers: { 'x-polling-merchants': merchantId },
      }
    )

    if (res.status === 204) return [] // sem eventos novos
    if (!res.ok) {
      throw new Error(`iFood: polling falhou (${res.status})`)
    }

    const events = await res.json()
    if (!Array.isArray(events)) return []

    return events.map((evt: any) => ({
      externalEventId: evt.id,
      externalOrderId: evt.orderId,
      type: mapEventCode(evt.fullCode ?? evt.code),
      createdAt: evt.createdAt,
      raw: evt,
    }))
  },

  async acknowledgeEvents(accessToken, eventIds): Promise<void> {
    if (eventIds.length === 0) return

    // A API aceita até 2000 IDs por request — fatiamos por segurança
    const CHUNK = 1000
    for (let i = 0; i < eventIds.length; i += CHUNK) {
      const chunk = eventIds.slice(i, i + CHUNK)
      const res = await ifoodFetch(`/order/v1.0/events/acknowledgment`, accessToken, {
        method: 'POST',
        body: JSON.stringify(chunk.map((id) => ({ id }))),
      })
      if (!res.ok && res.status !== 202) {
        throw new Error(`iFood: falha ao confirmar (ack) eventos (${res.status})`)
      }
    }
  },

  async getOrder(accessToken, externalOrderId): Promise<NormalizedMarketplaceOrder> {
    const res = await ifoodFetch(`/order/v1.0/orders/${externalOrderId}`, accessToken)
    if (!res.ok) {
      throw new Error(`iFood: falha ao buscar pedido ${externalOrderId} (${res.status})`)
    }
    const data = await res.json()
    return normalizeIfoodOrder(data)
  },

  async confirmOrder(accessToken, externalOrderId): Promise<void> {
    const res = await ifoodFetch(`/order/v1.0/orders/${externalOrderId}/confirm`, accessToken, {
      method: 'POST',
    })
    if (!res.ok && res.status !== 202) {
      throw new Error(`iFood: falha ao confirmar pedido ${externalOrderId} (${res.status})`)
    }
  },

  async cancelOrder(accessToken, externalOrderId, reason): Promise<void> {
    // iFood exige um cancellationCode válido (consultar /cancellationReasons);
    // "501" (erro no sistema) é usado como fallback genérico quando o motivo
    // informado não mapeia para um código conhecido.
    const res = await ifoodFetch(`/order/v1.0/orders/${externalOrderId}/requestCancellation`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ reason, cancellationCode: '501' }),
    })
    if (!res.ok && res.status !== 202) {
      throw new Error(`iFood: falha ao cancelar pedido ${externalOrderId} (${res.status})`)
    }
  },

  async dispatchOrder(accessToken, externalOrderId): Promise<void> {
    const res = await ifoodFetch(`/order/v1.0/orders/${externalOrderId}/dispatch`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ deliveredBy: 'MERCHANT' }),
    })
    if (!res.ok && res.status !== 202) {
      throw new Error(`iFood: falha ao despachar pedido ${externalOrderId} (${res.status})`)
    }
  },
}

// Converte o payload bruto de GET /orders/{id} do iFood para o formato neutro.
// Valores monetários no iFood chegam em centavos OU em decimal dependendo do
// endpoint/versão — a Merchant API v1.0 usa decimal direto (ex: 25.90).
function normalizeIfoodOrder(raw: any): NormalizedMarketplaceOrder {
  const items = (raw.items ?? []).map((item: any) => ({
    externalItemId: item.id ?? item.uniqueId,
    name: item.name,
    quantity: item.quantity ?? 1,
    unitPrice: Number(item.unitPrice?.value ?? item.unitPrice ?? 0),
    totalPrice: Number(item.totalPrice?.value ?? item.totalPrice ?? 0),
    notes: item.observations ?? item.note,
    addons: (item.options ?? item.subItems ?? []).map((opt: any) => ({
      name: opt.name,
      price: Number(opt.unitPrice?.value ?? opt.price ?? 0),
      quantity: opt.quantity ?? 1,
    })),
  }))

  const address = raw.delivery?.deliveryAddress
  const deliveredByMerchant = raw.delivery?.mode === 'MERCHANT' || raw.orderType === 'TAKEOUT'

  return {
    provider: 'IFOOD',
    externalOrderId: raw.id,
    externalDisplayId: raw.displayId,
    externalMerchantId: raw.merchant?.id,
    customerName: raw.customer?.name,
    customerPhone: raw.customer?.phone?.number,
    isVirtualPhone: Boolean(raw.customer?.phone?.isVirtual),
    items,
    subtotal: Number(raw.total?.subTotal ?? 0),
    deliveryFee: Number(raw.total?.deliveryFee ?? 0),
    discountAmount: Number(raw.total?.benefits ?? 0),
    total: Number(raw.total?.orderAmount ?? 0),
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
          formatted: address.formattedAddress,
        }
      : undefined,
    deliveredBy: deliveredByMerchant ? 'MERCHANT' : 'MARKETPLACE',
    paymentMethod: raw.payments?.methods?.[0]?.method,
    // No marketplace iFood (não-PIX-direto), o pagamento online é processado
    // pelo iFood e repassado ao lojista — não cobrar novamente do cliente.
    isPaidOnline: raw.payments?.methods?.[0]?.type === 'ONLINE' || raw.payments?.prepaid === true,
    notes: raw.orderNote ?? raw.notes,
    createdAt: raw.createdAt,
    rawPayload: raw,
  }
}
