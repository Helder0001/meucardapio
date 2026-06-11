// actions/auth/mfa.ts
// Ativação e verificação de MFA (TOTP) com otplib.
//
// Fluxo de ativação:
//   1. generateMfaSecret()  → gera secret + QR Code URI
//   2. Usuário escaneia o QR no Google Authenticator / Authy
//   3. enableMfa(code)      → verifica código e ativa MFA + gera backup codes
//
// Fluxo de login:
//   - O auth callback (config.ts) verifica mfaEnabled e lança TOTP_REQUIRED
//   - Frontend exibe formulário → verifyMfaCode(userId, code)

'use server'

import { authenticator } from '@otplib/preset-default'
import { prisma } from '@/lib/db/client'
import { auth } from '@/lib/auth/session'
import { encrypt, decrypt } from '@/lib/security/crypto'
import { nanoid } from 'nanoid'
import crypto from 'crypto'

// Gera um secret TOTP e retorna a URI para o QR Code
export async function generateMfaSecret(): Promise<{
  secret: string
  otpauthUrl: string
  error?: string
}> {
  const session = await auth()
  if (!session?.user?.id) return { secret: '', otpauthUrl: '', error: 'Não autenticado' }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } })
  if (!user) return { secret: '', otpauthUrl: '', error: 'Usuário não encontrado' }

  const secret = authenticator.generateSecret()
  const otpauthUrl = authenticator.keyuri(user.email, 'FoodSaaS', secret)

  // Armazenar secret criptografado temporariamente (pendente de verificação)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { mfaSecret: encrypt(secret) },
  })

  return { secret, otpauthUrl }
}

// Verifica o código TOTP e ativa o MFA (gera backup codes)
export async function enableMfa(code: string): Promise<{ backupCodes?: string[]; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Não autenticado' }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mfaSecret: true, mfaEnabled: true },
  })

  if (!user?.mfaSecret) return { error: 'Secret não gerado. Reinicie o processo.' }
  if (user.mfaEnabled) return { error: 'MFA já está ativado.' }

  const secret = decrypt(user.mfaSecret)
  const isValid = authenticator.verify({ token: code, secret })
  if (!isValid) return { error: 'Código inválido ou expirado.' }

  // Gerar 8 backup codes de uso único
  const backupCodes = Array.from({ length: 8 }, () =>
    `${nanoid(4)}-${nanoid(4)}`.toUpperCase()
  )
  // Armazenar hashes dos backup codes (não os códigos em texto puro)
  const hashedBackups = backupCodes.map((c) =>
    crypto.createHash('sha256').update(c).digest('hex')
  )

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      mfaEnabled: true,
      mfaBackupCodes: hashedBackups,
    },
  })

  return { backupCodes }
}

// Desativa o MFA (requer senha ou backup code)
export async function disableMfa(code: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Não autenticado' }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mfaSecret: true, mfaEnabled: true },
  })

  if (!user?.mfaEnabled) return { error: 'MFA não está ativado.' }

  const secret = decrypt(user.mfaSecret!)
  const isValid = authenticator.verify({ token: code, secret })
  if (!isValid) return { error: 'Código inválido.' }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
  })

  return {}
}

// Verifica código TOTP ou backup code durante o login
export async function verifyMfaCode(
  userId: string,
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabled: true, mfaBackupCodes: true },
  })

  if (!user?.mfaEnabled || !user.mfaSecret) {
    return { valid: false, error: 'MFA não configurado.' }
  }

  // Tentar como TOTP
  const secret = decrypt(user.mfaSecret)
  if (authenticator.verify({ token: code, secret })) {
    return { valid: true }
  }

  // Tentar como backup code (use único — remove após validação)
  const inputHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex')
  const codeIndex = user.mfaBackupCodes.findIndex((h) => h === inputHash)

  if (codeIndex !== -1) {
    const remaining = user.mfaBackupCodes.filter((_, i) => i !== codeIndex)
    await prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: remaining },
    })
    return { valid: true }
  }

  return { valid: false, error: 'Código inválido.' }
}
