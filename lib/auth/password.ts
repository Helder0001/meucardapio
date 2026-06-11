// lib/auth/password.ts
//
// Argon2id é o algoritmo recomendado pela OWASP para hash de senhas (2024).
// É mais resistente a ataques de GPU e ASIC do que bcrypt.
//
// Parâmetros balanceados para produção:
// - memoryCost: 64MB — torna ataques massivos caros em memória
// - timeCost: 3 iterações
// - parallelism: 1

import argon2 from 'argon2'

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 1,
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

// Validação de força de senha
export function validatePasswordStrength(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (password.length < 8) errors.push('Mínimo 8 caracteres')
  if (!/[A-Z]/.test(password)) errors.push('Pelo menos 1 letra maiúscula')
  if (!/[a-z]/.test(password)) errors.push('Pelo menos 1 letra minúscula')
  if (!/[0-9]/.test(password)) errors.push('Pelo menos 1 número')

  return { valid: errors.length === 0, errors }
}
