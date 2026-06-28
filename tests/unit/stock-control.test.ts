// tests/unit/stock-control.test.ts
// Testes do módulo central de controle de estoque (lib/utils/stock.ts):
// decremento na venda, estorno no cancelamento e ajuste manual.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  decrementStockForOrder,
  restockCancelledOrder,
  adjustStockManually,
  isOutOfStock,
} from '@/lib/utils/stock'

// ── Mock de uma transação Prisma em memória ────────────────────────────────
// Simula tx.stock e tx.stockMovement com um pequeno "banco" em memória,
// o que permite testar a lógica de decremento condicional e idempotência
// sem precisar do Prisma Client real.

function createMockTx(initialStocks: Array<{ id: string; pdvId: string; productId: string; quantity: number }>) {
  const stocks = new Map(initialStocks.map((s) => [s.id, { ...s }]))
  const movements: any[] = []

  const tx = {
    stock: {
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        let results = [...stocks.values()].filter(
          (s) => s.productId === where.productId
        )
        if (orderBy?.quantity === 'desc') {
          results = results.sort((a, b) => b.quantity - a.quantity)
        }
        return results.map((s) => ({ ...s }))
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const s = stocks.get(where.id)
        return s ? { ...s } : null
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        const s = stocks.get(where.id)
        return s ? { ...s } : null
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const s = stocks.get(where.id)
        if (!s) throw new Error('not found')
        if (data.quantity?.increment !== undefined) s.quantity += data.quantity.increment
        else if (data.quantity?.decrement !== undefined) s.quantity -= data.quantity.decrement
        else if (typeof data.quantity === 'number') s.quantity = data.quantity
        return { ...s }
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const s = stocks.get(where.id)
        if (!s) return { count: 0 }
        if (where.quantity?.gte !== undefined && s.quantity < where.quantity.gte) {
          return { count: 0 }
        }
        if (data.quantity?.decrement !== undefined) s.quantity -= data.quantity.decrement
        return { count: 1 }
      }),
    },
    stockMovement: {
      create: vi.fn(async ({ data }: any) => {
        movements.push({ ...data })
        return { id: `mv-${movements.length}`, ...data }
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return movements.filter((m) => {
          if (where.orderId && m.orderId !== where.orderId) return false
          if (where.type && m.type !== where.type) return false
          if (where.tenantId && m.tenantId !== where.tenantId) return false
          return true
        })
      }),
    },
  }

  return { tx, stocks, movements }
}

describe('decrementStockForOrder', () => {
  it('decrementa o estoque do produto vendido e registra movimento SALE', async () => {
    const { tx, stocks, movements } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 10 },
    ])

    await decrementStockForOrder(tx as any, {
      tenantId: 'tenant-1',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', quantity: 3 }],
    })

    expect(stocks.get('stk-1')!.quantity).toBe(7)
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({ type: 'SALE', quantity: 3, orderId: 'order-1' })
  })

  it('decrementa do PDV com mais estoque primeiro, depois do segundo', async () => {
    const { tx, stocks, movements } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 2 },
      { id: 'stk-2', pdvId: 'pdv-2', productId: 'prod-1', quantity: 5 },
    ])

    await decrementStockForOrder(tx as any, {
      tenantId: 'tenant-1',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', quantity: 4 }],
    })

    // PDV-2 tinha mais estoque (5), então é debitado primeiro: 5 -> 1 (4 unidades)
    // PDV-1 não precisa ser tocado pois 4 <= 5
    expect(stocks.get('stk-2')!.quantity).toBe(1)
    expect(stocks.get('stk-1')!.quantity).toBe(2)
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({ stockId: 'stk-2', quantity: 4 })
  })

  it('divide entre múltiplos PDVs quando nenhum cobre a quantidade total', async () => {
    const { tx, stocks, movements } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 2 },
      { id: 'stk-2', pdvId: 'pdv-2', productId: 'prod-1', quantity: 3 },
    ])

    await decrementStockForOrder(tx as any, {
      tenantId: 'tenant-1',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', quantity: 4 }],
    })

    // Total = 5. Decrementa 3 do pdv-2 (maior) e 1 do pdv-1.
    expect(stocks.get('stk-2')!.quantity).toBe(0)
    expect(stocks.get('stk-1')!.quantity).toBe(1)
    expect(movements).toHaveLength(2)
  })

  it('não decrementa nem gera movimento para produto sem estoque cadastrado', async () => {
    const { tx, movements } = createMockTx([])

    await decrementStockForOrder(tx as any, {
      tenantId: 'tenant-1',
      orderId: 'order-1',
      items: [{ productId: 'prod-sem-controle', quantity: 2 }],
    })

    expect(movements).toHaveLength(0)
  })

  it('nunca deixa o estoque negativo mesmo se a quantidade vendida exceder o saldo', async () => {
    const { tx, stocks } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 1 },
    ])

    await decrementStockForOrder(tx as any, {
      tenantId: 'tenant-1',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', quantity: 5 }],
    })

    expect(stocks.get('stk-1')!.quantity).toBe(0)
  })
})

describe('restockCancelledOrder', () => {
  it('devolve ao estoque a quantidade vendida originalmente', async () => {
    const { tx, stocks } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 7 }, // já debitado: 10 -> 7
    ])

    // Simula que esse pedido já vendeu 3 unidades (movimento SALE existente)
    await tx.stockMovement.create({
      data: {
        tenantId: 'tenant-1', stockId: 'stk-1', productId: 'prod-1', pdvId: 'pdv-1',
        orderId: 'order-1', type: 'SALE', quantity: 3, balanceAfter: 7,
      },
    })

    await restockCancelledOrder(tx as any, { tenantId: 'tenant-1', orderId: 'order-1' })

    expect(stocks.get('stk-1')!.quantity).toBe(10)
  })

  it('é idempotente: não estorna duas vezes o mesmo pedido', async () => {
    const { tx, stocks } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 7 },
    ])

    await tx.stockMovement.create({
      data: {
        tenantId: 'tenant-1', stockId: 'stk-1', productId: 'prod-1', pdvId: 'pdv-1',
        orderId: 'order-1', type: 'SALE', quantity: 3, balanceAfter: 7,
      },
    })

    await restockCancelledOrder(tx as any, { tenantId: 'tenant-1', orderId: 'order-1' })
    expect(stocks.get('stk-1')!.quantity).toBe(10)

    // Segunda chamada (ex.: cron e webhook competindo) não deve duplicar o crédito
    await restockCancelledOrder(tx as any, { tenantId: 'tenant-1', orderId: 'order-1' })
    expect(stocks.get('stk-1')!.quantity).toBe(10)
  })

  it('não faz nada para pedido sem nenhum item com controle de estoque', async () => {
    const { tx, stocks } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 5 },
    ])

    await restockCancelledOrder(tx as any, { tenantId: 'tenant-1', orderId: 'order-sem-vendas' })

    expect(stocks.get('stk-1')!.quantity).toBe(5)
  })
})

describe('adjustStockManually', () => {
  it('MANUAL_IN soma a quantidade informada ao saldo', async () => {
    const { tx, stocks } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 5 },
    ])

    const result = await adjustStockManually(tx as any, {
      tenantId: 'tenant-1', stockId: 'stk-1', type: 'MANUAL_IN', quantity: 10,
    })

    expect(result.quantity).toBe(15)
    expect(stocks.get('stk-1')!.quantity).toBe(15)
  })

  it('MANUAL_OUT subtrai a quantidade informada do saldo', async () => {
    const { tx, stocks } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 10 },
    ])

    const result = await adjustStockManually(tx as any, {
      tenantId: 'tenant-1', stockId: 'stk-1', type: 'MANUAL_OUT', quantity: 4,
    })

    expect(result.quantity).toBe(6)
  })

  it('MANUAL_OUT rejeita saída maior que o saldo disponível', async () => {
    const { tx } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 3 },
    ])

    await expect(
      adjustStockManually(tx as any, {
        tenantId: 'tenant-1', stockId: 'stk-1', type: 'MANUAL_OUT', quantity: 10,
      })
    ).rejects.toThrow(/insuficiente/)
  })

  it('ADJUSTMENT define o saldo para o valor absoluto informado', async () => {
    const { tx, stocks } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 20 },
    ])

    const result = await adjustStockManually(tx as any, {
      tenantId: 'tenant-1', stockId: 'stk-1', type: 'ADJUSTMENT', quantity: 8,
    })

    expect(result.quantity).toBe(8)
    expect(stocks.get('stk-1')!.quantity).toBe(8)
  })

  it('rejeita quantidade negativa', async () => {
    const { tx } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 5 },
    ])

    await expect(
      adjustStockManually(tx as any, {
        tenantId: 'tenant-1', stockId: 'stk-1', type: 'MANUAL_IN', quantity: -1,
      })
    ).rejects.toThrow(/negativa/)
  })

  it('lança erro se o registro de estoque não existir no tenant', async () => {
    const { tx } = createMockTx([])

    await expect(
      adjustStockManually(tx as any, {
        tenantId: 'tenant-1', stockId: 'inexistente', type: 'MANUAL_IN', quantity: 1,
      })
    ).rejects.toThrow(/não encontrado/)
  })

  it('retorna o productId do estoque ajustado, para acionar revalidação do cardápio', async () => {
    const { tx } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 5 },
    ])

    const result = await adjustStockManually(tx as any, {
      tenantId: 'tenant-1', stockId: 'stk-1', type: 'MANUAL_IN', quantity: 1,
    })

    expect(result.productId).toBe('prod-1')
  })
})

describe('isOutOfStock', () => {
  it('produto sem nenhum registro de Stock nunca está esgotado (estoque "infinito")', () => {
    expect(isOutOfStock([])).toBe(false)
  })

  it('produto com saldo positivo em um PDV não está esgotado', () => {
    expect(isOutOfStock([{ quantity: 5 }])).toBe(false)
  })

  it('produto com saldo zero em todos os PDVs está esgotado', () => {
    expect(isOutOfStock([{ quantity: 0 }])).toBe(true)
  })

  it('soma o saldo de múltiplos PDVs antes de decidir', () => {
    expect(isOutOfStock([{ quantity: 0 }, { quantity: 3 }])).toBe(false)
    expect(isOutOfStock([{ quantity: 0 }, { quantity: 0 }])).toBe(true)
  })

  it('aceita Decimal do Prisma (objeto com toString) e valores string', () => {
    expect(isOutOfStock([{ quantity: '0' }])).toBe(true)
    expect(isOutOfStock([{ quantity: { toString: () => '2.5' } }])).toBe(false)
  })
})

describe('affectedProductIds — sinal para revalidação do cardápio digital', () => {
  it('decrementStockForOrder retorna o productId vendido', async () => {
    const { tx } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 5 },
    ])

    const { affectedProductIds } = await decrementStockForOrder(tx as any, {
      tenantId: 'tenant-1', orderId: 'order-1',
      items: [{ productId: 'prod-1', quantity: 2 }],
    })

    expect(affectedProductIds).toEqual(['prod-1'])
  })

  it('decrementStockForOrder não retorna nada para produto sem controle de estoque', async () => {
    const { tx } = createMockTx([])

    const { affectedProductIds } = await decrementStockForOrder(tx as any, {
      tenantId: 'tenant-1', orderId: 'order-1',
      items: [{ productId: 'prod-sem-controle', quantity: 2 }],
    })

    expect(affectedProductIds).toEqual([])
  })

  it('restockCancelledOrder retorna os productIds estornados', async () => {
    const { tx } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 7 },
    ])
    await tx.stockMovement.create({
      data: {
        tenantId: 'tenant-1', stockId: 'stk-1', productId: 'prod-1', pdvId: 'pdv-1',
        orderId: 'order-1', type: 'SALE', quantity: 3, balanceAfter: 7,
      },
    })

    const { affectedProductIds } = await restockCancelledOrder(tx as any, {
      tenantId: 'tenant-1', orderId: 'order-1',
    })

    expect(affectedProductIds).toEqual(['prod-1'])
  })

  it('restockCancelledOrder não retorna nada quando já foi estornado (idempotência)', async () => {
    const { tx } = createMockTx([
      { id: 'stk-1', pdvId: 'pdv-1', productId: 'prod-1', quantity: 7 },
    ])
    await tx.stockMovement.create({
      data: {
        tenantId: 'tenant-1', stockId: 'stk-1', productId: 'prod-1', pdvId: 'pdv-1',
        orderId: 'order-1', type: 'SALE', quantity: 3, balanceAfter: 7,
      },
    })

    await restockCancelledOrder(tx as any, { tenantId: 'tenant-1', orderId: 'order-1' })
    const second = await restockCancelledOrder(tx as any, { tenantId: 'tenant-1', orderId: 'order-1' })

    expect(second.affectedProductIds).toEqual([])
  })
})
