// app/(dashboard)/dashboard/settings/whatsapp/automacoes/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ChatbotAutomationSettings } from '@/components/dashboard/chatbot-automation-settings'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Automações do Chat' }

export default async function ChatbotAutomationsPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/dashboard')

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Link href="/dashboard" className="hover:text-foreground">Início</Link>
          <span>/</span>
          <span>Marketing</span>
          <span>/</span>
          <span className="text-foreground">Automações do Chat</span>
        </div>
        <Link
          href="/dashboard/settings/whatsapp"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar para WhatsApp
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Automações do Chat</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Configure o robô de atendimento e as interações automatizadas do WhatsApp.
        </p>
      </div>

      <ChatbotAutomationSettings />
    </div>
  )
}
