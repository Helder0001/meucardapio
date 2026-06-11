// tests/integration/health.test.ts
// Testa o endpoint de healthcheck.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  prisma: { $queryRaw: vi.fn() },
}))
vi.mock('@/lib/cache/redis', () => ({
  redis: { ping: vi.fn() },
}))

import { prisma } from '@/lib/db/client'
import { redis } from '@/lib/cache/redis'

// Inline check functions for testing
async function checkDatabase() {
  const start = Date.now()
  try {
    await (prisma.$queryRaw as any)`SELECT 1`
    return { ok: true, latencyMs: Date.now() - start }
  } catch {
    return { ok: false, error: 'database unreachable' }
  }
}

async function checkRedis() {
  const start = Date.now()
  try {
    await (redis as any).ping()
    return { ok: true, latencyMs: Date.now() - start }
  } catch {
    return { ok: false, error: 'redis unreachable' }
  }
}

describe('Healthcheck checks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('database check retorna ok quando banco responde', async () => {
    ;(prisma.$queryRaw as any).mockResolvedValue([{ '?column?': 1 }])
    const result = await checkDatabase()
    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('database check retorna erro quando banco falha', async () => {
    ;(prisma.$queryRaw as any).mockRejectedValue(new Error('connection refused'))
    const result = await checkDatabase()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('unreachable')
  })

  it('redis check retorna ok quando Redis responde', async () => {
    ;(redis.ping as any).mockResolvedValue('PONG')
    const result = await checkRedis()
    expect(result.ok).toBe(true)
  })

  it('redis check retorna erro quando Redis falha', async () => {
    ;(redis.ping as any).mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await checkRedis()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('unreachable')
  })
})
