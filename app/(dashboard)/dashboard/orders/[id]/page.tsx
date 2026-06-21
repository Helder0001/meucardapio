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
      payments: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, method: true, status: true, amount: true,
          pixQrCode: true, pixQrCodeBase64: true, paidAt: true,
          changeAmount: true, createdAt: true, pixExpiresAt: true,
        },
      },
      statusHistory: {
        orderBy: { createdAt: 'asc' },
        select: {
          status: true, createdAt: true, notes: true,
          user: { select: { name: true, role: true } },
        },
      },
    },
  })

  if (!order) notFound()

  // CORREÇÃO: mesma checagem de expiração de PIX usada no polling do cliente
  // — assim a tela do dashboard também cancela sozinha, sem depender só do
  // webhook do MP nem do cron diário.
  const pendingPix = order.payments.find((p) => p.method === 'PIX' && p.status === 'PENDING')
  if (order.status === 'PENDING' && pendingPix?.pixExpiresAt && pendingPix.pixExpiresAt < new Date()) {
    await prisma.$transaction([
      prisma.payment.updateMany({
        where: { orderId: id, method: 'PIX', status: 'PENDING' },
        data: { status: 'FAILED', failedAt: new Date() },
      }),
      prisma.order.update({
        where: { id },
        data: {
          status: 'CANCELLED', paymentStatus: 'FAILED',
          cancelledAt: new Date(), cancelReason: 'PIX expirado sem pagamento',
        },
      }),
    ])
    order.status = 'CANCELLED'
    order.paymentStatus = 'FAILED'
    pendingPix.status = 'FAILED'
  }

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
      {/* CORREÇÃO: garçons (STAFF) só podem confirmar, cancelar ou marcar
          como entregue — demais transições ficam ocultas. */}
      <OrderDetail order={serialized} userRole={session.user.role} />
    </div>
  )
}
