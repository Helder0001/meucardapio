// app/(dashboard)/dashboard/settings/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { GeneralSettingsForm } from '@/components/dashboard/general-settings-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Configurações' }

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const tenant = await prisma.tenant.findFirst({
    where: { id: session.user.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      phone: true,
      email: true,
      cnpj: true,
      logo: true,
      primaryColor: true,
      latitude: true,
      longitude: true,
      settings: true,
      businessHours: { orderBy: { dayOfWeek: 'asc' } },
    },
  })

  if (!tenant) redirect('/login')

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Dados do estabelecimento e horários de funcionamento
        </p>
      </div>
      <GeneralSettingsForm tenant={tenant} />
    </div>
  )
}
