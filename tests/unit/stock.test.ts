// tests/unit/stock.test.ts
// Testes de validação de estoque no calculador de pedidos
// e decremento correto na criação de pedidos.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  prisma: {
    product:      { findMany: vi.fn() },
    addon:        { findMany: vi.fn() },
    deliveryZone: { findFirst: vi.fn() },
    coupon:       { findFirst: vi.fn() },
    customer:     { findFirst: vi.fn() },
    stock:        { findMany: vi.fn() },
  },
}))

import { calculateOrder } from '@/lib/utils/order-calculator'
import { prisma } from '@/lib/db/client'

const tenantId = 'tenant-abc'

const productWithStock = (overrides = {}) => ({
  id: 'prod-1',
  name: 'Pizza Margherita',
  price: 42.90,
  isActive: true,
  stocks: [{ pdvId: 'pdv-1', quantity: 5, minQuantity: 2 }],
  ...overrides,
})

const baseInput = {
  tenantId,
  items: [{ productId: 'prod-1', quantity: 2, addonIds: [] }],
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.addon.findMany as any).mockResolvedValue([])
  ;(prisma.deliveryZone.findFirst as any).mockResolvedValue(null)
  ;(prisma.coupon.findFirst as any).mockResolvedValue(null)
  ;(prisma.customer.findFirst as any).mockResolvedValue(null)
})

describe('Validação de estoque no calculateOrder', () => {
  it('aceita pedido quando há estoque suficiente', async () => {
    ;(prisma.product.findMany as any).mockResolvedValue([productWithStock()])
    const result = await calculateOrder(baseInput)
    expect(result.errors).toHaveLength(0)
    expect(result.items).toHaveLength(1)
  })

  it('rejeita quando estoque é insuficiente', async () => {
    ;(prisma.product.findMany as any).mockResolvedValue([
      productWithStock({ stocks: [{ pdvId: 'pdv-1', quantity: 1, minQuantity: null }] }),
    ])
    const result = await calculateOrder({
      ...baseInput,
      items: [{ productId: 'prod-1', quantity: 3, addonIds: [] }],
    })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toMatch(/apenas 1 unidade/)
  })

  it('rejeita com mensagem de esgotado quando quantity=0', async () => {
    ;(prisma.product.findMany as any).mockResolvedValue([
      productWithStock({ stocks: [{ pdvId: 'pdv-1', quantity: 0, minQuantity: null }] }),
    ])
    const result = await calculateOrder(baseInput)
    expect(result.errors[0]).toMatch(/esgotado/)
  })

  it('soma estoque de múltiplos PDVs', async () => {
    ;(prisma.product.findMany as any).mockResolvedValue([
      productWithStock({
        stocks: [
          { pdvId: 'pdv-1', quantity: 2, minQuantity: null },
          { pdvId: 'pdv-2', quantity: 3, minQuantity: null },
        ],
      }),
    ])
    // Total = 5 — pedido de 4 deve passar
    const result = await calculateOrder({
      ...baseInput,
      items: [{ productId: 'prod-1', quantity: 4, addonIds: [] }],
    })
    expect(result.errors).toHaveLength(0)
  })

  it('aceita produto sem estoque cadastrado (sem controle)', async () => {
    ;(prisma.product.findMany as any).mockResolvedValue([
      productWithStock({ stocks: [] }),
    ])
    const result = await calculateOrder(baseInput)
    expect(result.errors).toHaveLength(0)
  })
})
