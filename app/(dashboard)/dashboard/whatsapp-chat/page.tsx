// app/(dashboard)/dashboard/whatsapp-chat/page.tsx
import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { WhatsAppChatClient } from '@/components/dashboard/whatsapp-chat-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'WhatsApp Chat' }

export default async function WhatsAppChatPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) redirect('/dashboard')

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">WhatsApp Chat</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Responda mensagens dos seus clientes diretamente pelo sistema
        </p>
      </div>
      <WhatsAppChatClient tenantId={session.user.tenantId} />
    </div>
  )
}
