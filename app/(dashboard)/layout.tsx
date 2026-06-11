// app/(dashboard)/layout.tsx
//
// Layout compartilhado por todas as páginas do dashboard.
// Server Component: verifica auth + permissões de role no servidor.

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/session'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { InactivityWarning } from '@/components/shared/inactivity-warning'

// Rotas que o WAITER tem acesso. Tudo fora desta lista redireciona para o kanban.
const WAITER_ALLOWED_PREFIXES = [
  '/dashboard/orders/kanban',
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')
  if (!session.user.tenantId && session.user.role !== 'MASTER_ADMIN') redirect('/login')

  // Garçom só pode acessar o kanban
  if (session.user.role === 'WAITER') {
    // Obtemos o pathname via headers (disponível em App Router server components)
    const { headers } = await import('next/headers')
    const headersList = await headers()
    const pathname = headersList.get('x-invoke-path') ??
                     headersList.get('next-url') ?? ''

    const allowed = WAITER_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))
    if (!allowed && pathname && !pathname.startsWith('/dashboard/orders/kanban')) {
      redirect('/dashboard/orders/kanban')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        userRole={session.user.role}
        tenantSlug={session.user.tenantSlug ?? ''}
        plan={session.user.plan ?? 'STARTER'}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header user={session.user} />
        <main className="flex-1 overflow-y-auto">
          <div className="container-app py-6">
            {children}
          </div>
        </main>
      </div>
      <InactivityWarning />
    </div>
  )
}
