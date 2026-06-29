// lib/mercadopago/token-manager.ts
//
// Garante um access token válido para a conexão MP de um tenant,
// renovando automaticamente via refresh_token quando necessário.
// Access tokens do MP duram 180 dias — a renovação aqui é defensiva,
// não algo que vai disparar com frequência no dia a dia.

import { prisma } from '@/lib/db/client'
import { encrypt, decrypt } from '@/lib/security/crypto'
import { refreshAccessToken } from './oauth-client'
import type { MercadoPagoConnection } from '@prisma/client'

const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000 // renova com 1 dia de antecedência

export async function getValidMpAccessToken(connection: MercadoPagoConnection): Promise<string> {
  const isExpiringSoon = connection.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS

  if (!isExpiringSoon) {
    return decrypt(connection.accessTokenEnc)
  }

  const refreshToken = decrypt(connection.refreshTokenEnc)

  try {
    const result = await refreshAccessToken(refreshToken)

    await prisma.mercadoPagoConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEnc: encrypt(result.accessToken),
        refreshTokenEnc: encrypt(result.refreshToken),
        expiresAt: new Date(Date.now() + result.expiresInSeconds * 1000),
        lastRefreshedAt: new Date(),
        scope: result.scope,
        liveMode: result.liveMode,
      },
    })

    return result.accessToken
  } catch (err) {
    console.error('[mercadopago/token-manager] Falha ao renovar token:', err)
    // Token antigo ainda pode funcionar por mais algumas horas — não
    // bloqueia o fluxo de pagamento por uma falha pontual na renovação.
    return decrypt(connection.accessTokenEnc)
  }
}

/** Busca a conexão ativa do tenant e já retorna o access token válido pronto pra uso. */
export async function getTenantMpAccessToken(tenantId: string): Promise<string | null> {
  const connection = await prisma.mercadoPagoConnection.findFirst({
    where: { tenantId, revokedAt: null },
  })
  if (!connection) return null
  return getValidMpAccessToken(connection)
}
