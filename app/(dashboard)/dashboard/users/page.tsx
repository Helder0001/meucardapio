// app/(dashboard)/dashboard/users/page.tsx
import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { UsersManager } from '@/components/dashboard/users-manager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Usuários & Permissões' }

export default async function UsersPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (session.user.role !== 'TENANT_ADMIN') redirect('/dashboard')

  const tenantId = session.user.tenantId

  const users = await prisma.user.findMany({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, name: true, email: true, role: true,
      phone: true, lastLoginAt: true, createdAt: true,
    },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuários &amp; Permissões</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Crie usuários e defina o nível de acesso de cada um no sistema.
          {' '}{users.length} usuário{users.length === 1 ? '' : 's'} cadastrado{users.length === 1 ? '' : 's'}.
        </p>
      </div>
      <UsersManager
        users={users}
        currentUserId={session.user.id}
      />
    </div>
  )
}
