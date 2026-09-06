// app/api/storefront/customer/route.ts
//
// Retorna histórico de pedidos + saldo de fidelidade/cashback do cliente
// identificado pelo telefone + tenantId. Usado na aba "Pedidos" do storefront.
//
// VULN-ALTA-04 CORRIGIDO (IDOR): antes, qualquer pessoa podia chamar esta
// rota com ?phone=<qualquer telefone>&tenantId=<X> e ver nome, saldo de
// cashback, pontos de fidelidade e até 20 pedidos recentes de QUALQUER
// cliente daquele tenant — nada validava que quem fazia a chamada era
// dono daquele telefone. Agora o telefone usado na consulta vem SEMPRE do
// cookie httpOnly assinado emitido em /api/otp/verify (nunca do query
// param, que é só um resquício aceito por compatibilidade e ignorado para
// fins de autorização) — sem sessão válida para o tenant pedido, a rota
// responde 401.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { getVerifiedPhoneForTenant } from '@/lib/security/customer-session'
import { isOutOfStock } from '@/lib/utils/stock'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get('tenantId')

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId é obrigatório' }, { status: 400 })
  }

  const phone = await getVerifiedPhoneForTenant(tenantId)
  if (!phone) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const [customer, loyaltyConfig] = await Promise.all([
    prisma.customer.findFirst({
      where: { phone, tenantId },
      select: {
        id: true, name: true, phone: true,
        loyaltyPoints: true, cashbackBalance: true,
        totalOrders: true, totalSpent: true,
        orders: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true, orderNumber: true, status: true, paymentStatus: true,
            total: true, type: true, createdAt: true,
            payments: { select: { method: true, status: true }, take: 1 },
            items: { select: { productName: true, quantity: true }, take: 3 },
          },
        },
      },
    }),
    prisma.loyaltyConfig.findFirst({
      where: { tenantId, isActive: true },
      select: { redeemEvery: true, redeemValue: true, minPointsRedeem: true },
    }),
  ])

  if (!customer) {
    return NextResponse.json({ customer: null, loyaltyConfig: null })
  }

  // CORREÇÃO (feature #10 "peça de novo"): produtos mais pedidos por esse
  // cliente nesse tenant, agregados por productId (não por nome — o
  // produto pode ter sido renomeado desde a última compra). Traz junto os
  // dados ATUAIS do produto (preço, imagem, disponibilidade), já que o
  // OrderItem só guarda o snapshot de quando o pedido foi feito — um
  // produto pode ter mudado de preço ou saído de estoque desde então.
  const topItems = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { order: { customerId: customer.id, tenantId } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 8,
  })

  const products = await prisma.product.findMany({
    where: { id: { in: topItems.map((t) => t.productId) }, tenantId },
    select: { id: true, name: true, price: true, image: true, categoryId: true, stocks: { select: { quantity: true } } },
  })
  const productById = new Map(products.map((p) => [p.id, p]))

  const frequentProducts = topItems
    .map((t) => {
      const p = productById.get(t.productId)
      if (!p) return null // produto foi excluído desde então
      return {
        id: p.id,
        name: p.name,
        price: Number(p.price),
        image: p.image,
        isOutOfStock: isOutOfStock(p.stocks),
        categoryId: p.categoryId,
        timesOrdered: t._sum.quantity ?? 0,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  return NextResponse.json({
    loyaltyConfig: loyaltyConfig
      ? {
          redeemEvery:     loyaltyConfig.redeemEvery,
          redeemValue:     Number(loyaltyConfig.redeemValue),
          minPointsRedeem: loyaltyConfig.minPointsRedeem,
        }
      : null,
    customer: {
      ...customer,
      cashbackBalance: Number(customer.cashbackBalance),
      totalSpent:      Number(customer.totalSpent),
      orders: customer.orders.map((o) => ({
        ...o,
        total: Number(o.total),
      })),
    },
    frequentProducts,
  })
}
