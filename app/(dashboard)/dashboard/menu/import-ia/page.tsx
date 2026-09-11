// app/(dashboard)/dashboard/menu/import-ia/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { ImportMenuClient } from '@/components/dashboard/menu/import-menu-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Importar cardápio com IA' }

export default async function ImportMenuPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/dashboard')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          📥 Importar cardápio com IA
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Envie uma foto ou PDF do seu cardápio e a IA identifica categorias, produtos, descrições e preços pra você.
        </p>
      </div>

      <ImportMenuClient />
    </div>
  )
}
