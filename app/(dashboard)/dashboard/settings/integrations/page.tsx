// app/(dashboard)/dashboard/settings/integrations/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { Plug } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Integrações' }

// Funcionalidade retirada temporariamente do ar até depois do lançamento —
// ver item "Integrações" marcado como "Em breve" em components/dashboard/sidebar.tsx.
// Trocar este placeholder de volta pelo <MarketplaceIntegrations /> quando for reativar.
export default async function IntegrationsPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/dashboard')

  return (
    <div className="max-w-2xl">
      <div className="flex flex-col items-center text-center gap-3 py-16 px-6 border border-dashed border-border rounded-2xl">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
          <Plug className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Integrações — Em breve</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          A conexão com iFood e 99Food ainda está em desenvolvimento e será liberada
          após o lançamento. Volte aqui em breve!
        </p>
      </div>
    </div>
  )
}
