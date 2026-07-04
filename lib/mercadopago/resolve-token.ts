// lib/mercadopago/resolve-token.ts
//
// Ponto único para resolver qual access token do Mercado Pago usar para
// gerar pagamentos (PIX/cartão) de um tenant. Substitui o padrão repetido
// `settings?.mercadoPagoAccessToken ?? process.env.MERCADOPAGO_ACCESS_TOKEN`
// que existia espalhado em 3 arquivos.
//
// Ordem de prioridade (cascata, do mais novo/seguro para o mais antigo):
// 1. MercadoPagoConnection (OAuth) — fluxo novo, token criptografado, renovado
//    automaticamente. Esse é o caminho recomendado e o único exibido na UI.
// 2. tenant.settings.mercadoPagoAccessToken — token colado manualmente
//    (fluxo legado, mantido só para não quebrar tenants que configuraram
//    assim antes do OAuth existir). NÃO exibido mais como opção na tela.
// 3. process.env.MERCADOPAGO_ACCESS_TOKEN — credencial da plataforma, usada
//    historicamente como fallback de desenvolvimento/demo.
//
// Mantemos os 3 níveis para não quebrar ninguém em produção durante a
// migração — quando todos os tenants tiverem migrado para OAuth, os níveis
// 2 e 3 podem ser removidos.

import { prisma } from '@/lib/db/client'
import { getValidMpAccessToken } from './token-manager'

export async function resolveTenantMpAccessToken(tenantId: string): Promise<string | null> {
  const connection = await prisma.mercadoPagoConnection.findFirst({
    where: { tenantId, revokedAt: null },
  })
  if (connection) {
    return getValidMpAccessToken(connection)
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true },
  })
  const legacyToken = (tenant?.settings as any)?.mercadoPagoAccessToken
  if (legacyToken) return legacyToken

  return process.env.MERCADOPAGO_ACCESS_TOKEN ?? null
}

// BUG: a public key (usada no BROWSER pra tokenizar o cartão) e o access
// token (usado no SERVIDOR pra cobrar) precisam vir da MESMA conta/aplicação
// do Mercado Pago — senão o cartão é tokenizado sob uma aplicação e a
// cobrança tentada sob outra, e o Card Payment Brick falha ("Erro ao
// carregar o formulário" / "Ocorreu um erro"). O código que resolvia a
// public key pulava o nível 2 (token legado colado manualmente) e ia direto
// pro fallback da plataforma — só a resolveTenantMpAccessToken() tinha a
// cascata completa. Agora as duas seguem exatamente a mesma ordem.
export async function resolveTenantMpPublicKey(tenantId: string): Promise<string | null> {
  const connection = await prisma.mercadoPagoConnection.findFirst({
    where: { tenantId, revokedAt: null },
    select: { publicKey: true },
  })
  if (connection?.publicKey) return connection.publicKey

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true },
  })
  const legacyPublicKey = (tenant?.settings as any)?.mercadoPagoPublicKey
  if (legacyPublicKey) return legacyPublicKey

  return process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? null
}
