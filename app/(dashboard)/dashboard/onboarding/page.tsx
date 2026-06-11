// app/(dashboard)/dashboard/onboarding/page.tsx
// Wizard de configuração inicial — exibido uma única vez após o cadastro.
// Guia o tenant pelos 4 passos essenciais para começar a receber pedidos.

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { OnboardingClient } from './onboarding-client'

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const tenant = await prisma.tenant.findFirst({
    where: { id: session.user.tenantId },
    select: {
      id: true,
      name: true,
      settings: true,
      _count: {
        select: {
          categories: true,
          products: true,
          businessHours: true,
        },
      },
    },
  })

  if (!tenant) redirect('/login')

  const settings = tenant.settings as Record<string, any>

  // Se onboarding já foi concluído, redirecionar para o dashboard
  if (settings?.onboardingCompleted) {
    redirect('/dashboard')
  }

  const progress = {
    hasCategory: tenant._count.categories > 0,
    hasProduct: tenant._count.products > 0,
    hasHours: tenant._count.businessHours > 0,
    hasWhatsapp: !!(settings?.whatsappInstanceId),
  }

  return (
    <OnboardingClient
      tenantId={tenant.id}
      tenantName={tenant.name}
      progress={progress}
    />
  )
}
