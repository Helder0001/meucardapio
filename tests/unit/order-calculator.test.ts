// tests/unit/order-calculator.test.ts
//
// Testes do cálculo de pedidos — módulo de segurança mais crítico.
// Execute com: pnpm test

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do Prisma para os testes
vi.mock('@/lib/db/client', () => ({
  prisma: {
    product:      { findMany: vi.fn() },
    addon:        { findMany: vi.fn() },
    deliveryZone: { findFirst: vi.fn() },
    coupon:       { findFirst: vi.fn() },
    customer:     { findFirst: vi.fn() },
  },
}))

import { calculateOrder } from '@/lib/utils/order-calculator'
import { prisma } from '@/lib/db/client'

const mockProducts = [
  { id: 'prod-1', name: 'Pizza Margherita', price: 42.90, isActive: true },
  { id: 'prod-2', name: 'Coca-Cola', price: 6.00, isActive: true },
]

const mockAddons = [
  { id: 'addon-1', name: 'Bacon extra', price: 5.00, isActive: true },
  { id: 'addon-2', name: 'Sem cebola', price: 0, isActive: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.product.findMany as any).mockResolvedValue(mockProducts)
  ;(prisma.addon.findMany as any).mockResolvedValue(mockAddons)
  ;(prisma.deliveryZone.findFirst as any).mockResolvedValue(null)
  ;(prisma.coupon.findFirst as any).mockResolvedValue(null)
  ;(prisma.customer.findFirst as any).mockResolvedValue(null)
})

describe('calculateOrder', () => {
  it('calcula subtotal corretamente', async () => {
    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [
        { productId: 'prod-1', quantity: 1, addonIds: [] },
        { productId: 'prod-2', quantity: 2, addonIds: [] },
      ],
    })

    expect(result.errors).toHaveLength(0)
    expect(result.subtotal).toBe(42.90 + 6.00 * 2)   // 54.90
    expect(result.total).toBe(54.90)
  })

  it('inclui preço de adicionais no cálculo', async () => {
    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [{ productId: 'prod-1', quantity: 1, addonIds: ['addon-1'] }],
    })

    expect(result.items[0].unitPrice).toBe(42.90 + 5.00)  // 47.90
    expect(result.subtotal).toBe(47.90)
  })

  it('ignora qualquer valor financeiro enviado pelo cliente', async () => {
    // O cliente tenta enviar um preço falso — não existe campo de preço na entrada
    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [
        {
          productId: 'prod-1',
          quantity: 1,
          addonIds: [],
          // Mesmo que o cliente enviasse price: 0.01, seria ignorado
          // porque a interface CartItemInput não tem campo price
        },
      ],
    })

    // O servidor usa o preço do banco (42.90), não do cliente
    expect(result.subtotal).toBe(42.90)
  })

  it('rejeita produto inativo ou de outro tenant', async () => {
    ;(prisma.product.findMany as any).mockResolvedValue([]) // produto não encontrado

    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [{ productId: 'prod-inexistente', quantity: 1, addonIds: [] }],
    })

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.total).toBe(0)
  })

  it('aplica cupom de porcentagem corretamente', async () => {
    ;(prisma.coupon.findFirst as any).mockResolvedValue({
      id: 'coupon-1',
      code: 'PROMO10',
      type: 'PERCENTAGE',
      value: 10,           // 10%
      maxDiscount: null,
      minOrderValue: null,
      usageLimit: null,
      usageCount: 0,
      startsAt: null,
      expiresAt: null,
    })

    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [{ productId: 'prod-1', quantity: 1, addonIds: [] }],
      couponCode: 'PROMO10',
    })

    expect(result.couponDiscount).toBeCloseTo(4.29)   // 10% de 42.90
    expect(result.total).toBeCloseTo(38.61)
  })

  it('aplica cupom de valor fixo corretamente', async () => {
    ;(prisma.coupon.findFirst as any).mockResolvedValue({
      id: 'coupon-2',
      code: 'DESC5',
      type: 'FIXED',
      value: 5.00,
      maxDiscount: null,
      minOrderValue: null,
      usageLimit: null,
      usageCount: 0,
      startsAt: null,
      expiresAt: null,
    })

    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [{ productId: 'prod-1', quantity: 1, addonIds: [] }],
      couponCode: 'DESC5',
    })

    expect(result.couponDiscount).toBe(5.00)
    expect(result.total).toBeCloseTo(37.90)
  })

  it('rejeita cupom expirado', async () => {
    ;(prisma.coupon.findFirst as any).mockResolvedValue(null) // findFirst retorna null para cupom expirado

    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [{ productId: 'prod-1', quantity: 1, addonIds: [] }],
      couponCode: 'EXPIRADO',
    })

    expect(result.errors).toContain('Cupom inválido ou expirado')
  })

  it('adiciona taxa de entrega corretamente', async () => {
    ;(prisma.deliveryZone.findFirst as any).mockResolvedValue({
      fee: 8.00,
      freeAbove: null,
      minOrder: null,
    })

    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [{ productId: 'prod-1', quantity: 1, addonIds: [] }],
      deliveryType: 'DELIVERY',
      deliveryBairro: 'Centro',
    })

    expect(result.deliveryFee).toBe(8.00)
    expect(result.total).toBe(42.90 + 8.00)
  })

  it('aplica entrega grátis acima do valor mínimo', async () => {
    ;(prisma.deliveryZone.findFirst as any).mockResolvedValue({
      fee: 8.00,
      freeAbove: 40.00, // grátis acima de R$ 40
      minOrder: null,
    })

    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [{ productId: 'prod-1', quantity: 1, addonIds: [] }], // subtotal = 42.90 > 40
      deliveryType: 'DELIVERY',
      deliveryBairro: 'Centro',
    })

    expect(result.deliveryFee).toBe(0)   // grátis!
    expect(result.total).toBe(42.90)
  })

  it('limita cashback ao saldo disponível do cliente', async () => {
    ;(prisma.customer.findFirst as any).mockResolvedValue({
      id: 'customer-1',
      cashbackBalance: 10.00,
    })

    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [{ productId: 'prod-1', quantity: 1, addonIds: [] }],
      customerId: 'customer-1',
      cashbackToUse: 999.00, // tenta usar muito mais do que tem
    })

    // Usa apenas o saldo disponível (10.00)
    expect(result.cashbackUsed).toBe(10.00)
    expect(result.total).toBeCloseTo(32.90)
  })

  it('garante que o total nunca fica negativo', async () => {
    ;(prisma.coupon.findFirst as any).mockResolvedValue({
      id: 'coupon-3',
      code: 'MEGA',
      type: 'FIXED',
      value: 9999.00, // desconto absurdo
      maxDiscount: null,
      minOrderValue: null,
      usageLimit: null,
      usageCount: 0,
      startsAt: null,
      expiresAt: null,
    })

    const result = await calculateOrder({
      tenantId: 'tenant-1',
      items: [{ productId: 'prod-1', quantity: 1, addonIds: [] }],
      couponCode: 'MEGA',
    })

    expect(result.total).toBeGreaterThanOrEqual(0)
  })
})
