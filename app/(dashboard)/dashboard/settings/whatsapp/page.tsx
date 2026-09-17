// app/(dashboard)/dashboard/settings/whatsapp/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { WhatsAppSettings } from '@/components/dashboard/whatsapp-settings'
import Link from 'next/link'
import { Bot, ChevronRight, Sparkles } from 'lucide-react'
import type { Metadata } from 'next'
import { hasWhatsAppAccess } from '@/lib/billing/pricing'

export const metadata: Metadata = { title: 'WhatsApp' }

export default async function WhatsAppPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  // CORREÇÃO: WhatsApp automático agora é exclusivo do plano Pro — quem
  // está no Normal vê uma tela de upgrade em vez da configuração.
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { plan: true, subscriptionStatus: true },
  })
  if (!tenant) redirect('/login')

  if (!hasWhatsAppAccess(tenant)) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-foreground">WhatsApp é exclusivo do plano Pro</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Confirmação automática de pedido, status em tempo real e cobrança pelo WhatsApp
            estão disponíveis no plano Pro. Seu plano atual é o Normal.
          </p>
          <Link
            href="/dashboard/settings/subscription"
            className="inline-flex items-center justify-center mt-5 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Ver planos e fazer upgrade
          </Link>
        </div>
      </div>
    )
  }

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
