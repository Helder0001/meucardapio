// lib/utils/stock.ts
//
// Módulo central de controle de estoque.
// Toda alteração em Stock.quantity deve passar por aqui, para garantir:
//   1. Consistência: todo movimento gera um registro em StockMovement
//      (histórico auditável de entradas/saídas).
//   2. Segurança contra concorrência: decrementos usam um UPDATE
//      condicional (WHERE quantity >= X) em vez de "ler e depois escrever",
//      evitando que dois pedidos simultâneos vendam o mesmo último item.
//   3. Idempotência no estorno: pedidos cancelados só devolvem estoque
//      uma vez (controlado pelo chamador, que deve marcar o pedido como
//      CANCELLED atomicamente com a chamada de estorno).
//
// Usado por:
//   - actions/orders/create-order.ts      → decrementStockForOrder (venda)
//   - app/api/internal/cron/cleanup       → restockCancelledOrder (estorno automático)
//   - app/api/orders/[id]/status          → restockCancelledOrder (PIX expirado)
//   - app/api/webhooks/mercadopago        → restockCancelledOrder (PIX cancelado no MP)
//   - app/api/orders/[id]/update-status   → restockCancelledOrder (cancelamento manual)
//   - actions/stock/adjust-stock.ts       → adjustStockManually (ajuste do lojista)

import type { PrismaClient, StockMovementType } from '@prisma/client'

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export interface OrderItemForStock {
  productId: string
  quantity: number
}

/**
 * Decrementa o estoque dos produtos vendidos em um pedido.
 *
 * Estratégia: para cada produto, busca os registros de Stock do tenant
 * (todos os PDVs) ordenados do maior para o menor saldo, e vai
 * decrementando até cobrir a quantidade vendida — sempre com um UPDATE
 * condicional (`quantity: { gte: decrement }`) para nunca deixar o saldo
 * negativo, mesmo sob concorrência (duas compras simultâneas do último item).
 *
 * Produtos sem nenhum registro de Stock não são controlados (loja não
 * cadastrou estoque para eles) — não geram movimento nem erro.
 *
 * Deve ser chamado DENTRO da mesma transação que cria o Order/OrderItem.
 */
export async function decrementStockForOrder(
  tx: Tx,
  params: { tenantId: string; orderId: string; items: OrderItemForStock[] }
): Promise<void> {
  const { tenantId, orderId, items } = params

  for (const item of items) {
    let remaining = item.quantity
    if (remaining <= 0) continue

    const stocks = await tx.stock.findMany({
      where: { tenantId, productId: item.productId },
      orderBy: { quantity: 'desc' }, // decrementa primeiro do PDV com mais estoque
    })

    for (const stock of stocks) {
      if (remaining <= 0) break

      const decrement = Math.min(remaining, Number(stock.quantity))
      if (decrement <= 0) continue

      // UPDATE condicional: só decrementa se o saldo ainda comportar a
      // quantidade — protege contra outra transação concorrente já ter
      // consumido esse estoque entre o findMany acima e este update.
      const updated = await tx.stock.updateMany({
        where: { id: stock.id, quantity: { gte: decrement } },
        data: { quantity: { decrement } },
      })

      if (updated.count === 0) {
        // Outra transação concorrente consumiu esse estoque primeiro.
        // Reconsulta o saldo atual e tenta decrementar o que sobrar.
        const fresh = await tx.stock.findUnique({ where: { id: stock.id } })
        if (!fresh) continue
        const retryDecrement = Math.min(remaining, Number(fresh.quantity))
        if (retryDecrement <= 0) continue
        const retried = await tx.stock.updateMany({
          where: { id: stock.id, quantity: { gte: retryDecrement } },
          data: { quantity: { decrement: retryDecrement } },
        })
        if (retried.count === 0) continue
        remaining -= retryDecrement
        await recordMovement(tx, {
          tenantId, stockId: stock.id, productId: item.productId, pdvId: stock.pdvId,
          orderId, type: 'SALE', quantity: retryDecrement,
        })
        continue
      }

      remaining -= decrement
      await recordMovement(tx, {
        tenantId, stockId: stock.id, productId: item.productId, pdvId: stock.pdvId,
        orderId, type: 'SALE', quantity: decrement,
      })
    }
    // Se `remaining` > 0 ao final, significa que o estoque ficou menor que
    // o vendido entre a validação (calculateOrder) e esta transação — caso
    // raro de concorrência extrema. Não bloqueamos o pedido já criado; o
    // saldo apenas chega a zero (nunca negativo) e o produto fica visível
    // como esgotado para os próximos pedidos.
  }
}

/**
 * Estorna o estoque de um pedido cancelado, devolvendo aos PDVs as
 * quantidades originalmente debitadas — usando o histórico de
 * StockMovement do tipo SALE daquele pedido como fonte da verdade
 * (em vez de reconsultar OrderItem), o que automaticamente:
 *   - devolve cada unidade ao MESMO PDV de onde saiu;
 *   - é resiliente a produtos sem controle de estoque (não geraram
 *     movimento de SALE, então não há nada a estornar);
 *   - é seguro contra chamada duplicada: só estorna o que ainda não
 *     tiver um CANCEL_REFUND correspondente para o mesmo pedido.
 *
 * Deve ser chamado DENTRO da mesma transação que marca o Order como
 * CANCELLED, para garantir atomicidade entre o cancelamento e o estorno.
 */
export async function restockCancelledOrder(
  tx: Tx,
  params: { tenantId: string; orderId: string }
): Promise<void> {
  const { tenantId, orderId } = params

  const [sales, alreadyRefunded] = await Promise.all([
    tx.stockMovement.findMany({
      where: { tenantId, orderId, type: 'SALE' },
    }),
    tx.stockMovement.findMany({
      where: { tenantId, orderId, type: 'CANCEL_REFUND' },
      select: { stockId: true },
    }),
  ])

  if (sales.length === 0) return // pedido sem itens com controle de estoque

  // Idempotência: se já existe QUALQUER estorno para este pedido, não
  // estorna de novo (evita duplo-crédito se o cancelamento automático e
  // o manual disputarem a mesma corrida).
  if (alreadyRefunded.length > 0) return

  for (const sale of sales) {
    const updated = await tx.stock.update({
      where: { id: sale.stockId },
      data: { quantity: { increment: sale.quantity } },
    })

    await recordMovement(tx, {
      tenantId,
      stockId: sale.stockId,
      productId: sale.productId,
      pdvId: sale.pdvId,
      orderId,
      type: 'CANCEL_REFUND',
      quantity: Number(sale.quantity),
      balanceAfterOverride: Number(updated.quantity),
    })
  }
}

/**
 * Ajuste manual de estoque feito pelo lojista no dashboard
 * (entrada de mercadoria, perda/quebra, ou correção de inventário).
 */
export async function adjustStockManually(
  tx: Tx,
  params: {
    tenantId: string
    stockId: string
    type: 'MANUAL_IN' | 'MANUAL_OUT' | 'ADJUSTMENT'
    quantity: number // para ADJUSTMENT: novo valor absoluto; para IN/OUT: delta positivo
    userId?: string
    reason?: string
  }
): Promise<{ quantity: number }> {
  const { tenantId, stockId, type, quantity, userId, reason } = params
  if (quantity < 0) throw new Error('Quantidade não pode ser negativa')

  const current = await tx.stock.findFirst({ where: { id: stockId, tenantId } })
  if (!current) throw new Error('Registro de estoque não encontrado')

  let updated
  let movementQuantity = quantity

  if (type === 'MANUAL_IN') {
    updated = await tx.stock.update({ where: { id: stockId }, data: { quantity: { increment: quantity } } })
  } else if (type === 'MANUAL_OUT') {
    const newQty = Number(current.quantity) - quantity
    if (newQty < 0) throw new Error('Quantidade insuficiente em estoque para essa saída')
    updated = await tx.stock.update({ where: { id: stockId }, data: { quantity: { decrement: quantity } } })
  } else {
    // ADJUSTMENT: define o valor absoluto e registra o delta como movimento
    movementQuantity = Math.abs(quantity - Number(current.quantity))
    updated = await tx.stock.update({ where: { id: stockId }, data: { quantity } })
  }

  await recordMovement(tx, {
    tenantId,
    stockId,
    productId: current.productId,
    pdvId: current.pdvId,
    type,
    quantity: movementQuantity,
    userId,
    reason,
    balanceAfterOverride: Number(updated.quantity),
  })

  return { quantity: Number(updated.quantity) }
}

async function recordMovement(
  tx: Tx,
  params: {
    tenantId: string
    stockId: string
    productId: string
    pdvId: string
    orderId?: string
    type: StockMovementType
    quantity: number
    userId?: string
    reason?: string
    balanceAfterOverride?: number
  }
): Promise<void> {
  let balanceAfter = params.balanceAfterOverride
  if (balanceAfter === undefined) {
    const stock = await tx.stock.findUnique({ where: { id: params.stockId } })
    balanceAfter = stock ? Number(stock.quantity) : 0
  }

  await tx.stockMovement.create({
    data: {
      tenantId: params.tenantId,
      stockId: params.stockId,
      productId: params.productId,
      pdvId: params.pdvId,
      orderId: params.orderId,
      type: params.type,
      quantity: params.quantity,
      balanceAfter,
      userId: params.userId,
      reason: params.reason,
    },
  })
}
