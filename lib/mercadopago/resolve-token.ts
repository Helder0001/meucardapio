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
//
// REMOVIDO: havia um 3º nível, process.env.MERCADOPAGO_ACCESS_TOKEN (conta
// da PLATAFORMA), usado como fallback quando o tenant não tinha conectado
// nada. Isso fazia qualquer tenant sem conexão própria "vazar" silenciosamente
// pra conta pessoal do dono da plataforma — sem erro nenhum, sem aviso.
// Agora um tenant sem MercadoPagoConnection nem token legado simplesmente
// não consegue gerar PIX/cartão (retorna null, e quem chama trata isso como
// "esse tenant não tem meio de pagamento configurado").

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

  return null
}

// BUG: a public key (usada no BROWSER pra tokenizar o cartão) e o access
// token (usado no SERVIDOR pra cobrar) precisam vir da MESMA conta/aplicação
// do Mercado Pago — senão o cartão é tokenizado sob uma aplicação e a
// cobrança tentada sob outra, e o Card Payment Brick falha ("Erro ao
// carregar o formulário" / "Ocorreu um erro"). O código que resolvia a
// public key pulava o nível 2 (token legado colado manualmente) e ia direto
// pro fallback da plataforma — só a resolveTenantMpAccessToken() tinha a
// cascata completa. Agora as duas seguem exatamente a mesma ordem (sem o
// fallback da plataforma, pelo mesmo motivo explicado acima).
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

  return null
}
