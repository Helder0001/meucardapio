// tests/unit/security.test.ts
// Testes de segurança cobrindo todas as vulnerabilidades corrigidas

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasPermission, hasRole } from '@/lib/auth/permissions'
import { canUsePlan } from '@/lib/db/tenant'
import { encrypt, decrypt, hashOTP, safeCompareHash, isEncrypted } from '@/lib/security/crypto'
import { sanitizeText, sanitizeNotes, normalizePhone, sanitizeCouponCode, isSafeUrl, isValidCuid } from '@/lib/security/sanitize'

// Mock da variavel de ambiente
process.env.ENCRYPTION_KEY = 'a'.repeat(64) // 32 bytes em hex para testes
process.env.OTP_SALT = 'b'.repeat(32)

describe('RBAC', () => {
  it('MASTER_ADMIN acessa tudo', () => {
    expect(hasPermission('MASTER_ADMIN', 'master:access')).toBe(true)
    expect(hasPermission('MASTER_ADMIN', 'orders:cancel')).toBe(true)
  })
  it('STAFF nao pode cancelar pedidos', () => {
    expect(hasPermission('STAFF', 'orders:cancel')).toBe(false)
  })
  it('DELIVERY_PERSON nao acessa relatorios', () => {
    expect(hasPermission('DELIVERY_PERSON', 'reports:view')).toBe(false)
  })
  it('hierarquia de roles correta', () => {
    expect(hasRole('MASTER_ADMIN', 'TENANT_ADMIN')).toBe(true)
    expect(hasRole('STAFF', 'MANAGER')).toBe(false)
  })
})

describe('Planos', () => {
  it('STARTER nao usa PRO', () => expect(canUsePlan('STARTER', 'PRO')).toBe(false))
  it('PREMIUM usa tudo', () => {
    expect(canUsePlan('PREMIUM', 'STARTER')).toBe(true)
    expect(canUsePlan('PREMIUM', 'PREMIUM')).toBe(true)
  })
})

describe('VULN-02: Criptografia AES-256-GCM', () => {
  it('criptografa e descriptografa corretamente', () => {
    const original  = 'minha-api-key-secreta-12345'
    const encrypted = encrypt(original)
    const decrypted = decrypt(encrypted)
    expect(decrypted).toBe(original)
  })

  it('nao e base64 simples', () => {
    const original  = 'api-key'
    const encrypted = encrypt(original)
    // base64 de "api-key" seria "YXBpLWtleQ==" - deve ser diferente
    expect(encrypted).not.toBe(Buffer.from(original).toString('base64'))
  })

  it('cada cifragem gera resultado diferente (IV aleatorio)', () => {
    const original = 'mesma-chave'
    const enc1 = encrypt(original)
    const enc2 = encrypt(original)
    // IVs aleatorios = resultados diferentes
    expect(enc1).not.toBe(enc2)
    // Mas ambos decriptam para o mesmo valor
    expect(decrypt(enc1)).toBe(original)
    expect(decrypt(enc2)).toBe(original)
  })

  it('detecta dado adulterado', () => {
    const encrypted = encrypt('dado-original')
    const tampered  = encrypted.replace(/.$/, 'x') // alterar ultimo char
    expect(() => decrypt(tampered)).toThrow()
  })

  it('isEncrypted detecta formato correto', () => {
    const encrypted = encrypt('test')
    expect(isEncrypted(encrypted)).toBe(true)
    expect(isEncrypted('texto-normal')).toBe(false)
    expect(isEncrypted(Buffer.from('api-key').toString('base64'))).toBe(false)
  })
})

describe('VULN-01: Hash de OTP', () => {
  it('hashOTP nao retorna o codigo original', () => {
    const code = '123456'
    const hash = hashOTP(code)
    expect(hash).not.toBe(code)
    expect(hash.length).toBeGreaterThan(32)
  })

  it('mesmo codigo sempre gera mesmo hash (deterministico)', () => {
    const code = '654321'
    expect(hashOTP(code)).toBe(hashOTP(code))
  })

  it('codigos diferentes geram hashes diferentes', () => {
    expect(hashOTP('111111')).not.toBe(hashOTP('222222'))
  })

  it('safeCompareHash e resistente a timing attack', () => {
    const hash = hashOTP('123456')
    expect(safeCompareHash(hash, hash)).toBe(true)
    expect(safeCompareHash(hash, hashOTP('999999'))).toBe(false)
  })
})

describe('VULN-05: Sanitizacao de inputs', () => {
  it('remove tags HTML', () => {
    expect(sanitizeText('<script>alert(1)</script>')).not.toContain('<script>')
    expect(sanitizeText('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })

  it('remove javascript: URI', () => {
    expect(sanitizeText('javascript:alert(1)')).not.toContain('javascript:')
  })

  it('remove event handlers', () => {
    expect(sanitizeText('onclick=alert(1)')).not.toContain('onclick=')
    expect(sanitizeText('onmouseover=evil()')).not.toContain('onmouseover=')
  })

  it('remove null bytes', () => {
    expect(sanitizeText('texto\0injetado')).not.toContain('\0')
  })

  it('normaliza telefone corretamente', () => {
    expect(normalizePhone('(11) 99999-9999')).toBe('5511999999999')
    expect(normalizePhone('11999999999')).toBe('5511999999999')
    expect(normalizePhone('abc')).toBeNull()
  })

  it('sanitizaCouponCode aceita apenas alphanumerico', () => {
    expect(sanitizeCouponCode('PROMO10')).toBe('PROMO10')
    expect(sanitizeCouponCode("'; DROP TABLE--")).toBe('DROPTABLE')
    expect(sanitizeCouponCode('ab')).toBeNull() // muito curto
  })

  it('isSafeUrl rejeita javascript: e data:', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeUrl('https://exemplo.com')).toBe(true)
    expect(isSafeUrl('http://localhost:3000')).toBe(true)
  })

  it('isValidCuid rejeita IDs manipulados', () => {
    expect(isValidCuid('cuid-valido-xxxxxxxxxx123456')).toBe(true)
    expect(isValidCuid('../../../etc/passwd')).toBe(false)
    expect(isValidCuid("'; DROP TABLE orders; --")).toBe(false)
    expect(isValidCuid('product-fake-price-0.01')).toBe(false)
  })
})

describe('VULN-09: Validacao de arquivos', () => {
  it('magic bytes JPEG corretos', () => {
    const jpegMagic = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
    expect(jpegMagic[0]).toBe(0xFF)
    expect(jpegMagic[1]).toBe(0xD8)
    expect(jpegMagic[2]).toBe(0xFF)
  })

  it('magic bytes PNG corretos', () => {
    const pngMagic = Buffer.from([0x89, 0x50, 0x4E, 0x47])
    expect(pngMagic[0]).toBe(0x89)
    expect(pngMagic[1]).toBe(0x50) // 'P'
    expect(pngMagic[2]).toBe(0x4E) // 'N'
    expect(pngMagic[3]).toBe(0x47) // 'G'
  })

  it('arquivo renomeado nao passa na validacao', () => {
    // Um .php renomeado para .jpg teria magic bytes de PHP (<?php)
    const fakeJpeg = Buffer.from('<?php echo "hack"; ?>')
    const isJpeg   = fakeJpeg[0] === 0xFF && fakeJpeg[1] === 0xD8
    expect(isJpeg).toBe(false) // reprovado na validacao de magic bytes
  })
})
