// app/api/storefront/customer/route.ts
//
// Retorna histórico de pedidos + saldo de fidelidade/cashback do cliente
// identificado pelo telefone + tenantId. Usado na aba "Pedidos" do storefront.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const phone    = searchParams.get('phone')
  const tenantId = searchParams.get('tenantId')

  if (!phone || !tenantId) {
    return NextResponse.json({ error: 'phone e tenantId são obrigatórios' }, { status: 400 })
  }

  const customer = await prisma.customer.findFirst({
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
          payments: {
            select: { method: true, status: true },
            take: 1,
          },
          items: {
            select: { productName: true, quantity: true },
            take: 3,
          },
        },
      },
    },
  })

  if (!customer) {
    return NextResponse.json({ customer: null })
  }

  return NextResponse.json({
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
