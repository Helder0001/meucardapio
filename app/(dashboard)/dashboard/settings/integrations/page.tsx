// app/(dashboard)/dashboard/settings/integrations/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { MarketplaceIntegrations } from '@/components/dashboard/marketplace-integrations'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Integrações' }

export default async function IntegrationsPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/dashboard')

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Conecte seu cardápio ao iFood e ao 99Food para receber os pedidos direto no seu painel
        </p>
      </div>
      <MarketplaceIntegrations />
    </div>
  )
}
