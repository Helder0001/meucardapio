// tests/unit/mfa.test.ts
// Testes unitários das actions de MFA (TOTP + backup codes).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// Mock deps
vi.mock('@/lib/auth/session', () => ({
  auth: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/security/crypto', () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v.replace('enc:', ''),
}))
vi.mock('@otplib/preset-default', () => ({
  authenticator: {
    generateSecret: () => 'TESTSECRET123456',
    keyuri: (email: string, issuer: string, secret: string) =>
      `otpauth://totp/${issuer}:${email}?secret=${secret}`,
    verify: vi.fn(),
  },
}))

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { authenticator } from '@otplib/preset-default'
import { generateMfaSecret, enableMfa, disableMfa, verifyMfaCode } from '@/actions/auth/mfa'

beforeEach(() => vi.clearAllMocks())

describe('generateMfaSecret', () => {
  it('retorna erro se não autenticado', async () => {
    ;(auth as any).mockResolvedValue(null)
    const result = await generateMfaSecret()
    expect(result.error).toBeTruthy()
  })

  it('gera secret e salva criptografado', async () => {
    ;(auth as any).mockResolvedValue({ user: { id: 'user-1' } })
    ;(prisma.user.findUnique as any).mockResolvedValue({ email: 'test@test.com' })
    ;(prisma.user.update as any).mockResolvedValue({})

    const result = await generateMfaSecret()

    expect(result.secret).toBe('TESTSECRET123456')
    expect(result.otpauthUrl).toContain('otpauth://totp/')
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mfaSecret: 'enc:TESTSECRET123456' }),
      })
    )
  })
})

describe('enableMfa', () => {
  it('rejeita código TOTP inválido', async () => {
    ;(auth as any).mockResolvedValue({ user: { id: 'user-1' } })
    ;(prisma.user.findUnique as any).mockResolvedValue({ mfaSecret: 'enc:SECRET', mfaEnabled: false })
    ;(authenticator.verify as any).mockReturnValue(false)

    const result = await enableMfa('000000')
    expect(result.error).toMatch(/inválido/)
  })

  it('ativa MFA e retorna 8 backup codes com código correto', async () => {
    ;(auth as any).mockResolvedValue({ user: { id: 'user-1' } })
    ;(prisma.user.findUnique as any).mockResolvedValue({ mfaSecret: 'enc:SECRET', mfaEnabled: false })
    ;(authenticator.verify as any).mockReturnValue(true)
    ;(prisma.user.update as any).mockResolvedValue({})

    const result = await enableMfa('123456')
    expect(result.backupCodes).toHaveLength(8)
    expect(result.backupCodes![0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  })
})

describe('verifyMfaCode', () => {
  it('aceita código TOTP válido', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue({
      mfaSecret: 'enc:SECRET',
      mfaEnabled: true,
      mfaBackupCodes: [],
    })
    ;(authenticator.verify as any).mockReturnValue(true)
    const result = await verifyMfaCode('user-1', '123456')
    expect(result.valid).toBe(true)
  })

  it('aceita backup code válido e remove após uso', async () => {
    const code = 'ABCD-EFGH'
    const hash = crypto.createHash('sha256').update(code).digest('hex')

    ;(prisma.user.findUnique as any).mockResolvedValue({
      mfaSecret: 'enc:SECRET',
      mfaEnabled: true,
      mfaBackupCodes: [hash, 'outrohash'],
    })
    ;(authenticator.verify as any).mockReturnValue(false)
    ;(prisma.user.update as any).mockResolvedValue({})

    const result = await verifyMfaCode('user-1', code)
    expect(result.valid).toBe(true)
    // Deve remover o backup code usado
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mfaBackupCodes: ['outrohash'] }),
      })
    )
  })

  it('rejeita código completamente inválido', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue({
      mfaSecret: 'enc:SECRET',
      mfaEnabled: true,
      mfaBackupCodes: [],
    })
    ;(authenticator.verify as any).mockReturnValue(false)
    const result = await verifyMfaCode('user-1', '999999')
    expect(result.valid).toBe(false)
  })
})
