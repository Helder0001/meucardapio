// app/(dashboard)/layout.tsx
//
// Layout compartilhado por todas as páginas do dashboard.
// Server Component: verifica autenticação básica.
//
// CORREÇÃO: a restrição de rotas por papel (STAFF/DELIVERY_PERSON só podem
// acessar /dashboard e /dashboard/orders/**) foi movida para middleware.ts,
// que roda no Edge antes da renderização e tem acesso confiável ao
// pathname — a abordagem anterior, baseada em headers() dentro do layout,
// não funcionava de forma confiável sem um middleware definindo esses
// headers, então garçons conseguiam acessar Relatórios, Configurações,
// Mesas etc. diretamente pela URL.

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/session'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { InactivityWarning } from '@/components/shared/inactivity-warning'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')
  if (!session.user.tenantId && session.user.role !== 'MASTER_ADMIN') redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        userRole={session.user.role}
        tenantSlug={session.user.tenantSlug ?? ''}
        plan={session.user.plan ?? 'STARTER'}
      />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header user={session.user} />
        <main className="flex-1 overflow-y-auto">
          <div className="container-app py-4 md:py-6 pb-24 md:pb-6">
            {children}
          </div>
        </main>
      </div>
      <InactivityWarning />
    </div>
  )
}
