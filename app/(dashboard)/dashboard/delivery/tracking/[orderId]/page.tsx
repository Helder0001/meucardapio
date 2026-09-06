// app/(dashboard)/dashboard/delivery/tracking/[orderId]/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { DeliveryTrackingScreen } from '@/components/dashboard/delivery-tracking-screen'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Entrega em Andamento — Meu Cardápio' }
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['DELIVERY_PERSON', 'TENANT_ADMIN', 'MANAGER']

interface PageProps {
  params: Promise<{ orderId: string }>
}

export default async function DeliveryTrackingDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!ALLOWED_ROLES.includes(session.user.role)) redirect('/dashboard')

  const { orderId } = await params

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: session.user.tenantId, type: 'DELIVERY' },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      courierId: true,
      deliveryAddress: true,
      deliveryBairro: true,
      deliveryLat: true,
      deliveryLng: true,
      tenant: { select: { latitude: true, longitude: true } },
    },
  })

  if (!order) notFound()

  // Um entregador não pode abrir a entrega de outro entregador (mesma
  // regra já aplicada em app/api/orders/[id]/update-status).
  if (
    session.user.role === 'DELIVERY_PERSON' &&
    order.courierId &&
    order.courierId !== session.user.id
  ) {
    redirect('/dashboard/delivery/tracking')
  }

  if (!['READY', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status)) {
    redirect('/dashboard/delivery/tracking')
  }

  const addr = order.deliveryAddress as any
  const addressLine: string | null =
    addr?.address ?? ([addr?.street, addr?.number].filter(Boolean).join(', ') || null)

  return (
    <DeliveryTrackingScreen
      orderId={order.id}
      orderNumber={order.orderNumber}
      initialStatus={order.status}
      addressLine={addressLine}
      bairro={order.deliveryBairro}
      store={
        order.tenant.latitude != null && order.tenant.longitude != null
          ? { lat: order.tenant.latitude, lng: order.tenant.longitude }
          : null
      }
      destination={
        order.deliveryLat != null && order.deliveryLng != null
          ? { lat: order.deliveryLat, lng: order.deliveryLng }
          : null
      }
    />
  )
}
