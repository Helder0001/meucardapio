// lib/security/crypto.ts
//
// Criptografia AES-256-GCM para dados sensíveis em repouso.
// Usado para: API Keys do WhatsApp, tokens de terceiros.
//
// AES-256-GCM:
// - Criptografia simétrica de 256 bits (padrão militar)
// - GCM (Galois/Counter Mode) garante autenticidade além de confidencialidade
// - Cada operação gera um IV (vetor de inicialização) aleatório único
// - Sem ENCRYPTION_KEY configurado → erro explícito (nunca silencioso)

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH  = 16  // bytes
const TAG_LENGTH = 16  // bytes (GCM auth tag)

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) {
    throw new Error(
      'ENCRYPTION_KEY não configurada. ' +
      'Gere com: openssl rand -hex 32'
    )
  }
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY deve ter exatamente 32 bytes (64 caracteres hex)')
  }
  return key
}

/**
 * Criptografa um texto com AES-256-GCM.
 * Retorna: iv:authTag:encrypted (tudo em hex, separado por ':')
 */
export function encrypt(plaintext: string): string {
  const key       = getKey()
  const iv        = randomBytes(IV_LENGTH)
  const cipher    = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

/**
 * Descriptografa um texto criptografado por encrypt().
 * Lança erro se o dado foi adulterado (autenticidade garantida pelo GCM).
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('Formato de dado criptografado inválido')
  }

  const [ivHex, authTagHex, encryptedHex] = parts
  const key       = getKey()
  const iv        = Buffer.from(ivHex,        'hex')
  const authTag   = Buffer.from(authTagHex,   'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8')
}

/**
 * Hash SHA-256 com salt para OTPs e tokens de curta duração.
 * Não reversível — apenas para verificação.
 */
export function hashOTP(otp: string): string {
  const salt = process.env.OTP_SALT
  if (!salt) throw new Error('OTP_SALT não configurado')

  const { createHash } = require('crypto')
  return createHash('sha256')
    .update(otp + salt)
    .digest('hex')
}

/**
 * Compara dois hashes de forma segura contra timing attacks.
 * Nunca use === para comparar hashes.
 */
export function safeCompareHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/**
 * Verifica se uma string já está no formato criptografado (iv:tag:data)
 * para evitar double-encryption.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p))
}
