// tests/unit/order-status-token.test.ts
// Testa o mecanismo de HMAC token para acesso público ao status do pedido.

import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'crypto'

// Simula a mesma lógica do route.ts
const SECRET = 'test-secret-32-chars-exactly-ok!'

function generateToken(orderId: string) {
  return crypto.createHmac('sha256', SECRET).update(orderId).digest('hex')
}

function validateToken(orderId: string, token: string): boolean {
  const expected = generateToken(orderId)
  if (expected.length !== token.length) return false
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(token, 'hex'),
    )
  } catch {
    return false
  }
}

describe('Order status token (HMAC)', () => {
  const orderId = 'cuid_abc123'

  it('token gerado é válido para o mesmo orderId', () => {
    const token = generateToken(orderId)
    expect(validateToken(orderId, token)).toBe(true)
  })

  it('token de um orderId não é válido para outro', () => {
    const token = generateToken(orderId)
    expect(validateToken('outro-order-id', token)).toBe(false)
  })

  it('token modificado é rejeitado (timing-safe)', () => {
    const token = generateToken(orderId)
    const tampered = token.slice(0, -2) + '00'
    expect(validateToken(orderId, tampered)).toBe(false)
  })

  it('string vazia é rejeitada', () => {
    expect(validateToken(orderId, '')).toBe(false)
  })

  it('token tem 64 caracteres hex', () => {
    const token = generateToken(orderId)
    expect(token).toMatch(/^[a-f0-9]{64}$/)
  })
})
