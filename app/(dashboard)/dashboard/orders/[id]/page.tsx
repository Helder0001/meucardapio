// app/(dashboard)/dashboard/orders/[id]/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { OrderDetail } from '@/components/dashboard/order-detail'
import { BackButton } from '@/components/shared/back-button'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Detalhe do Pedido' }

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const { id } = await params

  const order = await prisma.order.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      customer:  { select: { name: true, phone: true, email: true, totalOrders: true, totalSpent: true } },
      table:     { select: { number: true, sector: true } },
      waiter:    { select: { name: true } },
      pdv:       { select: { name: true } },
      createdBy: { select: { name: true } },
      coupon:    { select: { code: true, type: true, value: true } },
      items: {
        include: {
          addons: { select: { addonName: true, addonPrice: true } },
        },
      },
      // CORREÇÃO: retorna TODOS os pagamentos do pedido (não apenas o
      // primeiro). Pedidos com pagamento dividido (ex: PIX + Dinheiro)
      // agora aparecem por completo no detalhe do pedido.
      payments: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, method: true, status: true, amount: true,
          pixQrCode: true, pixQrCodeBase64: true, paidAt: true,
          changeAmount: true, createdAt: true,
        },
      },
      statusHistory: {
        orderBy: { createdAt: 'asc' },
        select: { status: true, createdAt: true, notes: true },
      },
    },
  })

  if (!order) notFound()

  const serialized = {
    ...order,
    total:          Number(order.total),
    subtotal:       Number(order.subtotal),
    deliveryFee:    Number(order.deliveryFee),
    discountAmount: Number(order.discountAmount),
    cashbackUsed:   Number(order.cashbackUsed),
    customer: order.customer ? {
      ...order.customer,
      totalSpent: Number(order.customer.totalSpent),
    } : null,
    coupon: order.coupon ? {
      ...order.coupon,
      value: Number(order.coupon.value),
    } : null,
    items: order.items.map((i) => ({
      ...i,
      unitPrice:  Number(i.unitPrice),
      totalPrice: Number(i.totalPrice),
      addons: i.addons.map((a) => ({ ...a, addonPrice: Number(a.addonPrice) })),
    })),
    payments: order.payments.map((p) => ({
      ...p,
      amount: Number(p.amount),
      changeAmount: p.changeAmount ? Number(p.changeAmount) : null,
    })),
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-bold text-foreground">
          Pedido #{String(order.orderNumber).padStart(4, '0')}
        </h1>
      </div>
      {/* CORREÇÃO: garçons (WAITER) só podem confirmar, cancelar ou marcar
          como entregue — demais transições ficam ocultas. */}
      <OrderDetail order={serialized} userRole={session.user.role} />
    </div>
  )
}
