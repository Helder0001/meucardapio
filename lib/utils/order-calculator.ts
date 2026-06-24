// lib/utils/order-calculator.ts
//
// ⚠️  REGRA DE SEGURANÇA CRÍTICA ⚠️
//
// Este módulo recalcula 100% dos valores de um pedido consultando o BANCO.
// NUNCA aceitar preços, totais, taxas ou descontos vindos do frontend.
//
// Um atacante poderia enviar:
//   { productId: "abc", quantity: 1, price: 0.01 }
// e comprar qualquer coisa por 1 centavo.
//
// Aqui ignoramos qualquer valor financeiro do cliente
// e buscamos tudo no banco de dados.

import { prisma } from '@/lib/db/client'

// O que o cliente envia (sem valores financeiros)
export interface CartItemInput {
  productId: string
  quantity: number
  addonIds: string[]   // IDs dos adicionais selecionados
  notes?: string
}

export interface CalculateOrderInput {
  tenantId: string
  items: CartItemInput[]
  couponCode?: string
  deliveryBairro?: string
  deliveryType?: 'DELIVERY' | 'PICKUP'
  customerId?: string
  cashbackToUse?: number   // quanto cashback o cliente quer usar
  pointsToRedeem?: number  // quantos pontos o cliente quer resgatar
}

export interface CalculatedOrder {
  subtotal: number
  deliveryFee: number
  couponDiscount: number
  cashbackUsed: number
  pointsDiscount: number   // desconto em R$ convertido dos pontos
  pointsRedeemed: number   // pontos efetivamente debitados
  total: number
  items: CalculatedItem[]
  coupon: { id: string; code: string; type: string } | null
  errors: string[]
}

export interface CalculatedItem {
  productId: string
  productName: string
  productPrice: number
  quantity: number
  unitPrice: number   // preço unitário + adicionais
  totalPrice: number  // unitPrice × quantity
  notes?: string
  addons: Array<{
    addonId: string
    addonName: string
    addonPrice: number
  }>
}

export async function calculateOrder(
  input: CalculateOrderInput
): Promise<CalculatedOrder> {
  const { tenantId, items, couponCode, deliveryBairro, deliveryType, customerId } = input
  const errors: string[] = []

  // ── 1. Buscar TODOS os produtos do banco ──────────────────
  const productIds = [...new Set(items.map((i) => i.productId))]
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      tenantId,      // CRÍTICO: garantir que são do mesmo tenant
      isActive: true,
    },
    include: {
      // Incluir estoque para validar disponibilidade antes de criar o pedido
      stocks: {
        select: { pdvId: true, quantity: true, minQuantity: true },
      },
    },
  })

  const productMap = new Map(products.map((p) => [p.id, p]))

  // Verificar se algum produto não foi encontrado
  for (const item of items) {
    if (!productMap.has(item.productId)) {
      errors.push(`Produto não disponível`)
    }
  }

  // ── 2. Buscar TODOS os addons do banco ────────────────────
  const addonIds = [...new Set(items.flatMap((i) => i.addonIds))]
  const addons = addonIds.length > 0
    ? await prisma.addon.findMany({
        where: {
          id: { in: addonIds },
          tenantId, // CRÍTICO: garantir que são do mesmo tenant
          isActive: true,
        },
      })
    : []

  const addonMap = new Map(addons.map((a) => [a.id, a]))

  // ── 3. Calcular subtotal ──────────────────────────────────
  let subtotal = 0
  const calculatedItems: CalculatedItem[] = []

  for (const item of items) {
    const product = productMap.get(item.productId)
    if (!product) continue // já adicionou erro acima

    if (item.quantity < 1 || item.quantity > 99) {
      errors.push(`Quantidade inválida para ${product.name}`)
      continue
    }

    // Verificar estoque disponível (se o produto controla estoque)
    // Soma o estoque de todos os PDVs do tenant
    if (product.stocks && product.stocks.length > 0) {
      const totalStock = product.stocks.reduce(
        (sum, s) => sum + Number(s.quantity), 0
      )
      if (totalStock < item.quantity) {
        errors.push(
          totalStock <= 0
            ? `"${product.name}" está esgotado`
            : `"${product.name}" tem apenas ${totalStock} unidade(s) disponível(is)`
        )
        continue
      }
    }

    const productPrice = Number(product.price)
    let addonTotal = 0
    const resolvedAddons = []

    for (const addonId of item.addonIds) {
      const addon = addonMap.get(addonId)
      if (!addon) {
        errors.push(`Adicional inválido`)
        continue
      }
      addonTotal += Number(addon.price)
      resolvedAddons.push({
        addonId: addon.id,
        addonName: addon.name,
        addonPrice: Number(addon.price),
      })
    }

    const unitPrice = productPrice + addonTotal
    const totalPrice = unitPrice * item.quantity
    subtotal += totalPrice

    calculatedItems.push({
      productId: product.id,
      productName: product.name,
      productPrice,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
      notes: item.notes,
      addons: resolvedAddons,
    })
  }

  if (errors.length > 0) {
    return { subtotal: 0, deliveryFee: 0, couponDiscount: 0, cashbackUsed: 0, pointsDiscount: 0, pointsRedeemed: 0, total: 0, items: [], coupon: null, errors }
  }

  // ── 4. Taxa de entrega ────────────────────────────────────
  let deliveryFee = 0
  if (deliveryType === 'DELIVERY' && deliveryBairro) {
    const zone = await prisma.deliveryZone.findFirst({
      where: { tenantId, bairro: deliveryBairro, isActive: true },
    })

    if (!zone) {
      errors.push(`Não realizamos entregas neste bairro`)
    } else {
      // Entrega grátis acima de determinado valor?
      const freeAbove = zone.freeAbove ? Number(zone.freeAbove) : null
      deliveryFee = freeAbove && subtotal >= freeAbove ? 0 : Number(zone.fee)

      // Pedido mínimo?
      if (zone.minOrder && subtotal < Number(zone.minOrder)) {
        errors.push(`Pedido mínimo para este bairro: ${zone.minOrder}`)
      }
    }
  }

  if (errors.length > 0) {
    return { subtotal, deliveryFee: 0, couponDiscount: 0, cashbackUsed: 0, pointsDiscount: 0, pointsRedeemed: 0, total: subtotal, items: calculatedItems, coupon: null, errors }
  }

  // ── 5. Cupom de desconto ──────────────────────────────────
  let couponDiscount = 0
  let appliedCoupon = null

  if (couponCode) {
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: couponCode.toUpperCase(),
        tenantId, // CRÍTICO
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } },
        ],
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
        ],
      },
    })

    if (!coupon) {
      errors.push('Cupom inválido ou expirado')
    } else if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      errors.push('Este cupom atingiu o limite de usos')
    } else if (coupon.minOrderValue && subtotal < Number(coupon.minOrderValue)) {
      errors.push(`Cupom válido para pedidos acima de R$ ${coupon.minOrderValue}`)
    } else {
      switch (coupon.type) {
        case 'PERCENTAGE':
          couponDiscount = (subtotal * Number(coupon.value)) / 100
          if (coupon.maxDiscount) {
            couponDiscount = Math.min(couponDiscount, Number(coupon.maxDiscount))
          }
          break
        case 'FIXED':
          couponDiscount = Math.min(Number(coupon.value), subtotal)
          break
        case 'FREE_DELIVERY':
          deliveryFee = 0
          break
      }
      appliedCoupon = { id: coupon.id, code: coupon.code, type: coupon.type }
    }
  }

  // ── 6. Cashback ───────────────────────────────────────────
  let cashbackUsed = 0
  const requestedCashback = input.cashbackToUse ?? 0

  if (requestedCashback > 0 && customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId }, // CRÍTICO: verificar tenant
      select: { cashbackBalance: true },
    })

    if (customer) {
      const available = Number(customer.cashbackBalance)
      const maxUsable = subtotal + deliveryFee - couponDiscount // não pode negativar

      // Usar o menor entre: solicitado, disponível, máximo permitido
      cashbackUsed = Math.min(requestedCashback, available, maxUsable)
      cashbackUsed = Math.max(0, cashbackUsed)
    }
  }

  // ── 7. Resgate de pontos ──────────────────────────────────
  let pointsDiscount = 0
  let pointsRedeemed = 0
  const requestedPoints = input.pointsToRedeem ?? 0

  if (requestedPoints > 0 && customerId) {
    const [customer, loyaltyConfig] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { loyaltyPoints: true } }),
      prisma.loyaltyConfig.findFirst({ where: { tenantId, isActive: true }, select: { redeemEvery: true, redeemValue: true, minPointsRedeem: true } }),
    ])

    if (customer && loyaltyConfig) {
      const available   = customer.loyaltyPoints
      const redeemEvery = loyaltyConfig.redeemEvery      // ex: 100 pontos
      const redeemValue = Number(loyaltyConfig.redeemValue) // ex: R$ 5,00
      const minPoints   = loyaltyConfig.minPointsRedeem

      // Só resgata em múltiplos de redeemEvery e com mínimo
      const validPoints = Math.min(requestedPoints, available)
      const blocks      = Math.floor(validPoints / redeemEvery)

      if (blocks > 0 && validPoints >= minPoints) {
        const maxBlocks = Math.floor(
          (subtotal + deliveryFee - couponDiscount - cashbackUsed) / redeemValue
        )
        const usedBlocks  = Math.min(blocks, maxBlocks)
        pointsDiscount    = usedBlocks * redeemValue
        pointsRedeemed    = usedBlocks * redeemEvery
      }
    }
  }

  // ── 8. Total final ────────────────────────────────────────
  const total = Math.max(0,
    subtotal + deliveryFee - couponDiscount - cashbackUsed - pointsDiscount
  )

  return {
    subtotal,
    deliveryFee,
    couponDiscount,
    cashbackUsed,
    pointsDiscount,
    pointsRedeemed,
    total,
    items: calculatedItems,
    coupon: appliedCoupon,
    errors: [],
  }
}
