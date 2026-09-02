// app/(dashboard)/dashboard/settings/whatsapp/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { WhatsAppSettings } from '@/components/dashboard/whatsapp-settings'
import Link from 'next/link'
import { Bot, ChevronRight } from 'lucide-react'
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
      <Link
        href="/dashboard/settings/whatsapp/automacoes"
        className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
      >
        <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
          <Bot className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-foreground text-sm">Automações do Chat</p>
          <p className="text-xs text-muted-foreground">
            Configure o robô de atendimento: boas-vindas, cardápio automático, status do pedido e mais.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </Link>

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
