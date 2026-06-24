// app/(dashboard)/dashboard/orders/kanban/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { KanbanBoard } from '@/components/dashboard/kanban/kanban-board'
import { KanbanNewOrderButton } from '@/components/dashboard/kanban/kanban-new-order-button'
import { prisma } from '@/lib/db/client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Kanban de Pedidos' }

export default async function KanbanPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const role = session.user.role
  const isDeliveryPerson = role === 'DELIVERY_PERSON'

  // Descobrir o PDV do usuário (para associar ao pedido criado)
  const userPdv = !['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(role)
    ? await prisma.pDVUser.findFirst({
        where: { userId: session.user.id },
        select: { pdvId: true },
      })
    : null

  const categories = await prisma.category.findMany({
    where: { tenantId: session.user.tenantId, isActive: true },
    select: {
      id: true, name: true,
      products: {
        where: { isActive: true },
        select: { id: true, name: true, price: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Kanban de Pedidos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isDeliveryPerson
              ? 'Seus pedidos de delivery'
              : 'Arraste os pedidos para atualizar o status em tempo real'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Ao vivo
          </div>
          {/* Novo pedido — oculto para entregadores */}
          {!isDeliveryPerson && (
            <KanbanNewOrderButton
              tenantId={session.user.tenantId}
              pdvId={userPdv?.pdvId}
              createdByUserId={session.user.id}
              categories={categories.map(c => ({
                ...c,
                products: c.products.map(p => ({ ...p, price: Number(p.price) }))
              }))}
            />
          )}
        </div>
      </div>

      {/* readOnly=true desabilita arrastar cards para operador */}
      <KanbanBoard
        tenantId={session.user.tenantId}
        userRole={role}
        lockedFilter={isDeliveryPerson ? 'DELIVERY' : undefined}
      />
    </div>
  )
}
