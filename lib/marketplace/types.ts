// lib/marketplace/types.ts
//
// Tipos compartilhados entre os clientes de marketplace (iFood, 99Food).
// Cada provider tem seu próprio formato de payload — a função de cada
// client é traduzir o formato nativo da plataforma para este formato
// "neutro", que é o que o resto do sistema (processOrder, UI) consome.

export type MarketplaceProviderKey = 'IFOOD' | 'NINETYNINE_FOOD'

// Endereço normalizado — todos os providers convergem para este formato.
export interface NormalizedAddress {
  street?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
  zipCode?: string
  reference?: string
  latitude?: number
  longitude?: number
  formatted?: string // string pronta para exibição, quando a plataforma já fornece
}

export interface NormalizedOrderItem {
  externalItemId: string
  name: string
  quantity: number
  unitPrice: number // em reais (não em centavos)
  totalPrice: number
  notes?: string
  addons: Array<{
    name: string
    price: number
    quantity: number
  }>
}

// Pedido já traduzido para o formato neutro — é isto que alimenta
// a criação do Order interno (ver lib/marketplace/process-order.ts).
export interface NormalizedMarketplaceOrder {
  provider: MarketplaceProviderKey
  externalOrderId: string
  externalDisplayId?: string
  externalMerchantId: string

  customerName?: string
  customerPhone?: string
  // Telefone "virtual"/proxy fornecido pela plataforma para contato sem expor o número real do cliente
  isVirtualPhone?: boolean

  items: NormalizedOrderItem[]
  subtotal: number
  deliveryFee: number
  discountAmount: number
  total: number

  deliveryAddress?: NormalizedAddress
  deliveredBy: 'MERCHANT' | 'MARKETPLACE'
  paymentMethod?: string
  isPaidOnline: boolean // true = já pago pela plataforma (não cobrar de novo no estabelecimento)

  notes?: string
  createdAt: string // ISO 8601

  // Payload bruto da plataforma — sempre preservado para auditoria/debug
  rawPayload: unknown
}

// Evento normalizado, vindo do polling/webhook — usado para decidir o que
// fazer (criar pedido, atualizar status, tratar cancelamento, etc.)
export interface NormalizedMarketplaceEvent {
  externalEventId: string
  externalOrderId: string
  type:
    | 'ORDER_PLACED'
    | 'ORDER_CONFIRMED'
    | 'ORDER_CANCELLED'
    | 'ORDER_CANCELLATION_REQUESTED'
    | 'ORDER_READY'
    | 'ORDER_DISPATCHED'
    | 'ORDER_CONCLUDED'
    | 'DRIVER_ASSIGNED'
    | 'UNKNOWN'
  createdAt: string
  raw: unknown
}

// Resultado da troca/renovação de token OAuth — formato comum
export interface OAuthTokenResult {
  accessToken: string
  refreshToken?: string
  tokenType: string
  expiresInSeconds: number
  scope?: string
}

// Interface que cada client de marketplace (IFoodClient, NinetyNineFoodClient)
// deve implementar. Mantém o resto do sistema agnóstico ao provider.
export interface MarketplaceClient {
  readonly provider: MarketplaceProviderKey

  /** Troca o código de autorização (ou client_credentials) por um token de acesso. */
  exchangeToken(params: Record<string, string>): Promise<OAuthTokenResult>

  /** Renova o access token usando o refresh token salvo. */
  refreshToken(refreshToken: string): Promise<OAuthTokenResult>

  /** Busca novos eventos (polling). Implementações com webhook nativo podem no-op aqui. */
  pollEvents(accessToken: string, merchantId: string): Promise<NormalizedMarketplaceEvent[]>

  /** Confirma o processamento de eventos para que não retornem no próximo polling. */
  acknowledgeEvents(accessToken: string, eventIds: string[]): Promise<void>

  /** Busca os detalhes completos de um pedido e já retorna no formato normalizado. */
  getOrder(accessToken: string, externalOrderId: string): Promise<NormalizedMarketplaceOrder>

  /** Confirma o pedido na plataforma (obrigatório dentro do prazo definido pelo provider). */
  confirmOrder(accessToken: string, externalOrderId: string): Promise<void>

  /** Recusa/cancela o pedido do lado do lojista. */
  cancelOrder(accessToken: string, externalOrderId: string, reason: string): Promise<void>

  /** Marca o pedido como despachado/saiu para entrega. */
  dispatchOrder(accessToken: string, externalOrderId: string): Promise<void>
}
