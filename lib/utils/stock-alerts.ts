// lib/utils/stock-alerts.ts
// Verifica estoque após um pedido e publica alertas no SSE/Notification
// para os produtos que ficaram abaixo de minQuantity.
// Chamado dentro da transação de createOrderAction (após o decremento).

import { prisma } from '@/lib/db/client'
import { redis, CacheKeys } from '@/lib/cache/redis'

export async function checkAndPublishStockAlerts(
  tenantId: string,
  productIds: string[]
) {
  if (!productIds.length) return

  // Busca o estoque atual de cada produto vendido
  const stocks = await prisma.stock.findMany({
    where: {
      tenantId,
      productId: { in: productIds },
    },
    include: {
      product: { select: { id: true, name: true } },
    },
  })

  const alerts: Array<{ productId: string; productName: string; quantity: number; minQuantity: number | null }> = []

  for (const stock of stocks) {
    const qty = Number(stock.quantity)
    const min = stock.minQuantity ? Number(stock.minQuantity) : null

    // Alerta se: zerou OU ficou abaixo do mínimo configurado
    if (qty <= 0 || (min !== null && qty <= min)) {
      alerts.push({
        productId:   stock.product.id,
        productName: stock.product.name,
        quantity:    qty,
        minQuantity: min,
      })
    }
  }

  if (!alerts.length) return

  // Persiste notificação no banco para cada alerta
  await prisma.notification.createMany({
    data: alerts.map((a) => ({
      tenantId,
      type:    'LOW_STOCK',
      title:   a.quantity <= 0 ? `"${a.productName}" esgotado` : `Estoque baixo: "${a.productName}"`,
      message: a.quantity <= 0
        ? `O produto "${a.productName}" está sem estoque.`
        : `Restam apenas ${a.quantity} unidade(s) de "${a.productName}".`,
      data: { productId: a.productId, quantity: a.quantity, minQuantity: a.minQuantity },
    })),
    skipDuplicates: false,
  })

  // Publica no canal SSE do tenant para notificação imediata no dashboard
  for (const alert of alerts) {
    await redis.publish(
      CacheKeys.orderChannel(tenantId),
      JSON.stringify({
        type:        'LOW_STOCK',
        productId:   alert.productId,
        productName: alert.productName,
        quantity:    alert.quantity,
      })
    )
  }
}
