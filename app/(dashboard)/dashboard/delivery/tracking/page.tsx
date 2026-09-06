// app/(dashboard)/dashboard/delivery/tracking/page.tsx
//
// Lista de entregas "saiu para entrega" — do entregador logado, ou ainda
// sem entregador (qualquer um pode assumir clicando). Ponto de entrada
// para a tela dedicada em [orderId]/page.tsx.
//
// Mesmo filtro já usado em app/api/delivery/active/route.ts.

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db/client'
import { formatOrderNumber } from '@/lib/utils/format'
import { Truck, MapPin, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Minhas Entregas — Meu Cardápio' }
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['DELIVERY_PERSON', 'TENANT_ADMIN', 'MANAGER']

export default async function DeliveryTrackingListPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!ALLOWED_ROLES.includes(session.user.role)) redirect('/dashboard')

  const orders = await prisma.order.findMany({
    where: {
      tenantId: session.user.tenantId,
      type: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
      OR: [{ courierId: session.user.id }, { courierId: null }],
    },
    select: {
      id: true,
      orderNumber: true,
      deliveryAddress: true,
      deliveryBairro: true,
      courierId: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Minhas Entregas</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Pedidos a caminho do cliente agora
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 flex flex-col items-center gap-2 text-center text-muted-foreground">
          <Truck className="h-8 w-8" />
          <p className="text-sm">Nenhuma entrega em andamento no momento.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const addr = order.deliveryAddress as any
            const addressLine: string | null =
              addr?.address ?? ([addr?.street, addr?.number].filter(Boolean).join(', ') || null)

            return (
              <Link
                key={order.id}
                href={`/dashboard/delivery/tracking/${order.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 hover:border-primary/40 transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">
                    Pedido {formatOrderNumber(order.orderNumber)}
                    {!order.courierId && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 rounded-full px-2 py-0.5">
                        Disponível
                      </span>
                    )}
                  </p>
                  {addressLine && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {addressLine}{order.deliveryBairro ? ` — ${order.deliveryBairro}` : ''}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
