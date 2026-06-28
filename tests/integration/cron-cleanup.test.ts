// tests/integration/cron-cleanup.test.ts
// Testa a rota de cron que cancela automaticamente pedidos PENDING sem
// pagamento há mais de 2 horas, e garante que o estoque é estornado.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  prisma: {
    printJob: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    customer: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    order: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/cache/redis', () => ({
  publishOrderEvent: vi.fn(),
}))

vi.mock('@/lib/utils/audit', () => ({
  auditLog: vi.fn(),
  AuditActions: { ORDER_CANCELLED: 'ORDER_CANCELLED' },
}))

vi.mock('@/lib/messaging/evolution', () => ({
  notifyOrderStatus: vi.fn(),
}))

vi.mock('@/lib/utils/stock', () => ({
  restockCancelledOrder: vi.fn(),
}))

// `after()` do Next.js não existe fora de uma request real — executamos a
// callback imediatamente para poder verificar os efeitos no teste.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<any>('next/server')
  return {
    ...actual,
    after: (cb: () => unknown) => cb(),
  }
})

import { prisma } from '@/lib/db/client'
import { restockCancelledOrder } from '@/lib/utils/stock'
import { GET } from '@/app/api/internal/cron/cleanup/route'

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET

function makeRequest(headers: Record<string, string> = {}) {
  return new Request('https://example.com/api/internal/cron/cleanup', { headers })
}

describe('GET /api/internal/cron/cleanup — cancelamento automático por falta de pagamento', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    ;(prisma.order.findMany as any).mockResolvedValue([])
  })

  afterAll(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET
  })

  it('rejeita requisições sem o segredo correto', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('aceita o header Authorization: Bearer enviado automaticamente pela Vercel', async () => {
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
    expect(res.status).toBe(200)
  })

  it('aceita o header legado x-cron-secret (uso manual/monitoramento)', async () => {
    const res = await GET(makeRequest({ 'x-cron-secret': 'test-secret' }))
    expect(res.status).toBe(200)
  })

  it('busca apenas pedidos PENDING com pagamento PENDING há mais de 2 horas', async () => {
    await GET(makeRequest({ authorization: 'Bearer test-secret' }))

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          paymentStatus: 'PENDING',
          createdAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      })
    )

    // A janela de tolerância deve ser de exatamente 2 horas
    const call = (prisma.order.findMany as any).mock.calls[0][0]
    const cutoff: Date = call.where.createdAt.lt
    const diffMs = Date.now() - cutoff.getTime()
    expect(diffMs).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000 - 1000)
    expect(diffMs).toBeLessThanOrEqual(2 * 60 * 60 * 1000 + 5000)
  })

  it('cancela cada pedido expirado e estorna o estoque dentro da mesma transação', async () => {
    const expiredOrder = { id: 'order-1', tenantId: 'tenant-1', orderNumber: 42 }
    ;(prisma.order.findMany as any).mockResolvedValue([expiredOrder])

    const txOrderUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const txStatusHistoryCreate = vi.fn().mockResolvedValue({})
    ;(prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({
        order: { updateMany: txOrderUpdateMany },
        orderStatusHistory: { create: txStatusHistoryCreate },
      })
    )

    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
    const body = await res.json()

    expect(body.cancelledOrders).toBe(1)
    expect(txOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', status: 'PENDING', paymentStatus: 'PENDING' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      })
    )
    expect(restockCancelledOrder).toHaveBeenCalledWith(
      expect.anything(),
      { tenantId: 'tenant-1', orderId: 'order-1' }
    )
  })

  it('não estorna nem conta o pedido se outra rotina já o cancelou antes (corrida)', async () => {
    const expiredOrder = { id: 'order-2', tenantId: 'tenant-1', orderNumber: 7 }
    ;(prisma.order.findMany as any).mockResolvedValue([expiredOrder])

    // updateMany retorna count 0: o WHERE status=PENDING não bateu mais
    // (ex.: o webhook do MP já cancelou esse pedido entre o findMany e agora)
    const txOrderUpdateMany = vi.fn().mockResolvedValue({ count: 0 })
    ;(prisma.$transaction as any).mockImplementation(async (fn: any) =>
      fn({ order: { updateMany: txOrderUpdateMany }, orderStatusHistory: { create: vi.fn() } })
    )

    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
    const body = await res.json()

    expect(body.cancelledOrders).toBe(0)
    expect(restockCancelledOrder).not.toHaveBeenCalled()
  })

  it('continua processando os próximos pedidos mesmo se um falhar', async () => {
    ;(prisma.order.findMany as any).mockResolvedValue([
      { id: 'order-a', tenantId: 'tenant-1', orderNumber: 1 },
      { id: 'order-b', tenantId: 'tenant-1', orderNumber: 2 },
    ])

    let call = 0
    ;(prisma.$transaction as any).mockImplementation(async (fn: any) => {
      call += 1
      if (call === 1) throw new Error('falha simulada no pedido A')
      return fn({
        order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        orderStatusHistory: { create: vi.fn() },
      })
    })

    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
    const body = await res.json()

    expect(body.cancelledOrders).toBe(1) // só o pedido B foi cancelado com sucesso
  })
})
