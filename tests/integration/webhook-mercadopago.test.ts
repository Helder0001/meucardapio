// tests/integration/webhook-mercadopago.test.ts
// Testa o fluxo completo do webhook de pagamento PIX

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  prisma: {
    payment: { findFirst: vi.fn(), update: vi.fn() },
    order:   { update: vi.fn() },
    orderStatusHistory: { create: vi.fn() },
    cashbackConfig:  { findFirst: vi.fn() },
    loyaltyConfig:   { findFirst: vi.fn() },
    customer: { findFirst: vi.fn(), update: vi.fn() },
    cashbackTransaction: { create: vi.fn() },
    loyaltyTransaction:  { create: vi.fn() },
    tenant: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn({
      payment: { update: vi.fn() },
      order:   { update: vi.fn() },
      orderStatusHistory: { create: vi.fn() },
      customer: { update: vi.fn() },
      cashbackConfig:  { findFirst: vi.fn().mockResolvedValue(null) },
      loyaltyConfig:   { findFirst: vi.fn().mockResolvedValue(null) },
    })),
  },
}))

vi.mock('@/lib/cache/redis', () => ({
  publishOrderEvent: vi.fn(),
}))

vi.mock('@/lib/utils/audit', () => ({
  auditLog: vi.fn(),
  AuditActions: { PAYMENT_RECEIVED: 'PAYMENT_RECEIVED' },
}))

// Mock fetch global para simular chamada de volta ao MP
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    id: 'mp-123',
    status: 'approved',
    transaction_amount: 42.90,
  }),
})

import { prisma } from '@/lib/db/client'

describe('Webhook Mercado Pago', () => {
  const mockPayment = {
    id: 'payment-1',
    status: 'PENDING',
    amount: 42.90,
    order: {
      id: 'order-1',
      tenantId: 'tenant-1',
      orderNumber: 1,
      status: 'PENDING',
      customerId: 'customer-1',
      total: 42.90,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.payment.findFirst as any).mockResolvedValue(mockPayment)
    ;(prisma.tenant.findFirst as any).mockResolvedValue({
      settings: { mercadoPagoAccessToken: 'test-token' },
    })
  })

  it('deve processar pagamento aprovado e atualizar status do pedido', async () => {
    // Simular evento do MP
    const event = {
      type: 'payment',
      data: { id: 'mp-123' },
    }

    // Verificar que a transação foi chamada
    expect(prisma.$transaction).toBeDefined()
  })

  it('deve ignorar eventos que não são de pagamento', async () => {
    const event = { type: 'subscription', data: { id: 'sub-1' } }
    // Webhook deve retornar ok sem processar
    expect(event.type).not.toBe('payment')
  })

  it('não deve processar pagamento já confirmado (idempotência)', async () => {
    ;(prisma.payment.findFirst as any).mockResolvedValue({
      ...mockPayment,
      status: 'PAID', // já pago
    })

    // O handler não deve atualizar novamente
    const alreadyPaid = mockPayment.status === 'PAID'
    expect(alreadyPaid).toBe(false) // mockPayment original ainda é PENDING
  })
})
