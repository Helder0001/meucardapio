// app/(dashboard)/dashboard/settings/whatsapp/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { WhatsAppSettings } from '@/components/dashboard/whatsapp-settings'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'WhatsApp' }

export default async function WhatsAppPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const config = await prisma.whatsappConfig.findFirst({
    where: { tenantId: session.user.tenantId },
  })

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">WhatsApp</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Conecte seu WhatsApp para notificar clientes automaticamente
        </p>
      </div>
      <WhatsAppSettings
        tenantId={session.user.tenantId}
        config={config ? {
          instanceName:    config.instanceName,
          status:          config.status,
          lastConnectedAt: config.lastConnectedAt?.toISOString() ?? null,
        } : null}
      />
    </div>
  )
}
