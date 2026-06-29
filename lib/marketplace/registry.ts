// lib/marketplace/registry.ts
//
// Ponto único para obter o client correto a partir do enum MarketplaceProvider
// do banco — evita "if/else provider === IFOOD" espalhado pelo código.

import type { MarketplaceProvider } from '@prisma/client'
import type { MarketplaceClient } from './types'
import { ifoodClient } from './ifood-client'
import { ninetyNineFoodClient } from './ninety-nine-food-client'

const clients: Record<MarketplaceProvider, MarketplaceClient> = {
  IFOOD: ifoodClient,
  NINETYNINE_FOOD: ninetyNineFoodClient,
}

export function getMarketplaceClient(provider: MarketplaceProvider): MarketplaceClient {
  const client = clients[provider]
  if (!client) {
    throw new Error(`Marketplace provider não suportado: ${provider}`)
  }
  return client
}

export const MARKETPLACE_LABELS: Record<MarketplaceProvider, string> = {
  IFOOD: 'iFood',
  NINETYNINE_FOOD: '99Food',
}
