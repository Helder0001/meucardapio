// lib/loyalty/apply-rewards.ts
//
// NOVO: extraído do webhook do Mercado Pago para ser reutilizado também pela
// rota de confirmação manual de pagamento (dinheiro/cartão na maquineta).
//
// CORREÇÃO: anteriormente cashback e pontos de fidelidade só eram creditados
// quando o pagamento PIX era confirmado via webhook automático. Pedidos pagos
// em dinheiro ou cartão (status PENDING até confirmação manual) nunca
// creditavam cashback/pontos — por isso as colunas "Cashback" e "Pontos" da
// tela de Clientes ficavam sempre zeradas para esses pedidos.

export async function applyCashback(
  tx: any,
  tenantId: string,
  customerId: string,
  orderId: string,
  total: number
) {
  const config = await tx.cashbackConfig.findFirst({ where: { tenantId, isActive: true } })
  if (!config) return

  const amount = Math.min(
    (total * Number(config.percentage)) / 100,
    config.maxCashback ? Number(config.maxCashback) : Infinity
  )
  if (amount <= 0) return

  const customer = await tx.customer.findFirst({ where: { id: customerId } })
  if (!customer) return

  const newBalance = Number(customer.cashbackBalance) + amount
  await tx.customer.update({ where: { id: customerId }, data: { cashbackBalance: newBalance } })
  await tx.cashbackTransaction.create({
    data: {
      tenantId,
      customerId,
      orderId,
      type: 'EARN',
      amount,
      balance: newBalance,
      expiresAt: new Date(Date.now() + config.validityDays * 86400000),
    },
  })
}

export async function applyLoyaltyPoints(
  tx: any,
  tenantId: string,
  customerId: string,
  orderId: string,
  total: number
) {
  const config = await tx.loyaltyConfig.findFirst({ where: { tenantId, isActive: true } })
  if (!config) return

  const points = Math.floor(total * Number(config.pointsPerReal))
  if (points <= 0) return

  const customer = await tx.customer.findFirst({ where: { id: customerId } })
  if (!customer) return

  const newBalance = customer.loyaltyPoints + points
  await tx.customer.update({ where: { id: customerId }, data: { loyaltyPoints: newBalance } })
  await tx.loyaltyTransaction.create({
    data: { tenantId, customerId, orderId, type: 'EARN', points, balance: newBalance },
  })
}

// Aplica cashback + pontos de fidelidade de uma vez, evitando duplicidade
// (verifica se já existe uma transação EARN para este pedido).
export async function applyOrderRewards(
  tx: any,
  tenantId: string,
  customerId: string | null,
  orderId: string,
  total: number
) {
  if (!customerId) return

  const [existingCashback, existingLoyalty] = await Promise.all([
    tx.cashbackTransaction.findFirst({ where: { orderId, type: 'EARN' } }),
    tx.loyaltyTransaction.findFirst({ where: { orderId, type: 'EARN' } }),
  ])

  if (!existingCashback) {
    await applyCashback(tx, tenantId, customerId, orderId, total)
  }
  if (!existingLoyalty) {
    await applyLoyaltyPoints(tx, tenantId, customerId, orderId, total)
  }
}
