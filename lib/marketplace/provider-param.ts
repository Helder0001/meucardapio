// lib/marketplace/provider-param.ts
//
// Valida o segmento de URL [provider] das rotas /api/marketplace/[provider]/*
// e converte para o enum do Prisma. Mantém as rotas agnósticas ao provider.

import type { MarketplaceProvider } from '@prisma/client'

const URL_TO_ENUM: Record<string, MarketplaceProvider> = {
  ifood: 'IFOOD',
  '99food': 'NINETYNINE_FOOD',
}

export function parseProviderParam(raw: string): MarketplaceProvider | null {
  return URL_TO_ENUM[raw.toLowerCase()] ?? null
}
