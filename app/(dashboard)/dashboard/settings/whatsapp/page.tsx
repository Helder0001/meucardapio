// app/(dashboard)/dashboard/settings/whatsapp/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { WhatsAppSettings } from '@/components/dashboard/whatsapp-settings'
import Link from 'next/link'
import { Bot, ChevronRight, KeyRound, Sparkles } from 'lucide-react'
import type { Metadata } from 'next'
import { hasWhatsAppAccess } from '@/lib/billing/pricing'

export const metadata: Metadata = { title: 'WhatsApp' }

export default async function WhatsAppPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  // CORREÇÃO: Normal agora pode conectar um número de WhatsApp — só que,
  // pra esse plano, o único uso dele é mandar o código de login do
  // cliente (ver lib/messaging/evolution.ts, purpose 'otp'). Confirmação
  // automática de pedido, status em tempo real, cobrança e automações do
  // chat continuam exclusivas do Pro — por isso o link de "Automações do
  // Chat" abaixo só aparece pra quem tem hasWhatsAppAccess.
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { plan: true, subscriptionStatus: true },
  })
  if (!tenant) redirect('/login')

  const proAccess = hasWhatsAppAccess(tenant)

  const config = await prisma.whatsappConfig.findFirst({
    where: { tenantId: session.user.tenantId },
  })

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">WhatsApp</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {proAccess
            ? 'Conecte seu WhatsApp para notificar clientes automaticamente'
            : 'Conecte seu WhatsApp para o código de login do cliente'}
        </p>
      </div>

      {!proAccess && (
        <div className="rounded-2xl border border-border bg-card p-5 flex gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <KeyRound className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground text-sm">No plano Normal, o WhatsApp só faz uma coisa</p>
            <p className="text-xs text-muted-foreground mt-1">
              Conectado, ele passa a enviar o código de verificação quando um cliente loga no seu
              cardápio pra ver pontos de fidelidade e cashback. Confirmação automática de pedido,
              status em tempo real, cobrança pelo WhatsApp e automações do chat são exclusivas do
              plano Pro.
            </p>
            <Link
              href="/dashboard/settings/subscription"
              className="inline-flex items-center gap-1 mt-2.5 text-xs font-semibold text-primary hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" /> Ver planos e fazer upgrade
            </Link>
          </div>
        </div>
      )}

      {proAccess && (
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
      )}

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
