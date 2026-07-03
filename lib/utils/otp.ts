// lib/utils/otp.ts
// VULN-01 CORRIGIDO: OTP nunca salvo em texto puro — apenas hash SHA-256
// VULN-07 CORRIGIDO: rate limit por IP E por telefone simultaneamente

import { hashOTP, safeCompareHash } from '@/lib/security/crypto'
import { storeOTP, getStoredOTP, deleteOTP } from '@/lib/cache/redis'
import { checkOtpRateLimit, otpSendLimiter } from '@/lib/security/rate-limit'
import { prisma } from '@/lib/db/client'
import { randomInt } from 'crypto'

const OTP_TTL_SECONDS  = 300  // 5 minutos
const MAX_ATTEMPTS     = 3

/**
 * Gera e armazena um OTP para verificação de cliente.
 * O código é gerado aqui, enviado pelo WhatsApp, e o HASH é salvo no Redis.
 * O código em si NUNCA toca o banco de dados.
 */
export async function generateOTP(
  phone: string,
  tenantId: string,
  ip: string
): Promise<{ code: string; error?: string }> {
  // Verificar se pode enviar mais um OTP (limite de envio)
  const sendKey = `${tenantId}:${phone}`
  const { success } = await otpSendLimiter.limit(sendKey)
  if (!success) {
    return { code: '', error: 'Muitos códigos enviados. Aguarde 1 hora.' }
  }

  // Gerar código de 6 dígitos — VULN-ALTA-02: usar CSPRNG (crypto.randomInt),
  // não Math.random(), que não é seguro para segredos/tokens.
  const code = randomInt(100000, 1000000).toString()

  // VULN-01 CORRIGIDO: salvar apenas o hash no Redis (nunca o código)
  const hashedCode = hashOTP(code)
  await storeOTP(phone, tenantId, hashedCode)

  // Resetar contador de tentativas
  await prisma.customer.updateMany({
    where: { phone, tenantId },
    data:  { otpAttempts: 0, otpExpiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) },
  })

  return { code } // retornar o código apenas para envio via WhatsApp
}

/**
 * Verifica um OTP enviado pelo cliente.
 * VULN-01: compara hashes (timing-safe), nunca texto puro
 * VULN-07: rate limit por IP E por telefone
 */
export async function verifyOTP(
  phone: string,
  tenantId: string,
  inputCode: string,
  ip: string
): Promise<{ valid: boolean; error?: string }> {
  // VULN-07 CORRIGIDO: verificar rate limit por IP E por telefone
  const { allowed, retryAfter } = await checkOtpRateLimit(ip, `${tenantId}:${phone}`)
  if (!allowed) {
    return {
      valid: false,
      error: `Muitas tentativas. Aguarde ${retryAfter ?? 60} segundos.`,
    }
  }

  // Buscar hash armazenado no Redis
  const storedHash = await getStoredOTP(phone, tenantId)
  if (!storedHash) {
    return { valid: false, error: 'Código expirado. Solicite um novo.' }
  }

  // VULN-01 CORRIGIDO: comparar hashes com timing-safe compare
  const inputHash = hashOTP(inputCode.trim())
  const isValid   = safeCompareHash(inputHash, storedHash as string)

  if (!isValid) {
    // Incrementar tentativas no banco
    const customer = await prisma.customer.findFirst({ where: { phone, tenantId } })
    if (customer) {
      const newAttempts = customer.otpAttempts + 1
      await prisma.customer.update({
        where: { id: customer.id },
        data:  { otpAttempts: newAttempts },
      })

      if (newAttempts >= MAX_ATTEMPTS) {
        // Invalidar o OTP após MAX_ATTEMPTS tentativas erradas
        await deleteOTP(phone, tenantId)
        return { valid: false, error: 'Código inválido. Solicite um novo.' }
      }

      const remaining = MAX_ATTEMPTS - newAttempts
      return { valid: false, error: `Código incorreto. ${remaining} tentativa(s) restante(s).` }
    }
    return { valid: false, error: 'Código incorreto.' }
  }

  // OTP válido — limpar do Redis e marcar cliente como verificado
  await deleteOTP(phone, tenantId)

  await prisma.customer.updateMany({
    where: { phone, tenantId },
    data:  {
      isVerified:    true,
      verifiedAt:    new Date(),
      otpAttempts:   0,
      otpExpiresAt:  null,
      // VULN-01: garantir que nunca há código em texto no banco
      otpCode:       null,
    },
  })

  return { valid: true }
}
