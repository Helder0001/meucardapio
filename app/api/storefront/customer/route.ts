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
  })
}
