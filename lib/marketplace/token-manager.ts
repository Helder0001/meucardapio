// lib/marketplace/token-manager.ts
//
// Garante que sempre obtemos um access token VÁLIDO para uma conexão,
// renovando automaticamente quando está perto de expirar.
// Centraliza a (des)criptografia — nenhum outro arquivo deve chamar
// encrypt/decrypt diretamente para tokens de marketplace.

import { prisma } from '@/lib/db/client'
import { encrypt, decrypt } from '@/lib/security/crypto'
import { getMarketplaceClient } from './registry'
import type { MarketplaceConnection } from '@prisma/client'

// Renova com 5 minutos de antecedência para evitar usar um token que
// expira "no meio" de uma chamada (polling, confirm, etc.)
const REFRESH_MARGIN_MS = 5 * 60 * 1000

export async function getValidAccessToken(connection: MarketplaceConnection): Promise<string> {
  if (!connection.accessTokenEnc) {
    throw new Error('Conexão sem token — autorização ainda não foi concluída.')
  }

  const expiresAt = connection.expiresAt?.getTime() ?? 0
  const isExpiringSoon = expiresAt - Date.now() < REFRESH_MARGIN_MS

  if (!isExpiringSoon) {
    return decrypt(connection.accessTokenEnc)
  }

  if (!connection.refreshTokenEnc) {
    // Sem refresh token (ex: 99Food client_credentials puro) — reautentica do zero
    // não é possível aqui sem o fluxo de autorização original; marca erro.
    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: { status: 'ERROR', lastPollingError: 'Token expirado e sem refresh token disponível.' },
    })
    throw new Error('Token expirado. É necessário reconectar esta loja.')
  }

  const client = getMarketplaceClient(connection.provider)
  const refreshToken = decrypt(connection.refreshTokenEnc)

  try {
    const result = await client.refreshToken(refreshToken)

    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEnc: encrypt(result.accessToken),
        refreshTokenEnc: result.refreshToken ? encrypt(result.refreshToken) : connection.refreshTokenEnc,
        expiresAt: new Date(Date.now() + result.expiresInSeconds * 1000),
        status: 'CONNECTED',
        lastPollingError: null,
      },
    })

    return result.accessToken
  } catch (err) {
    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: {
        status: 'ERROR',
        lastPollingError: err instanceof Error ? err.message : 'Falha ao renovar token',
      },
    })
    throw err
  }
}
