// app/(master)/master/settings/page.tsx
//
// Estava linkado no menu (app/(master)/layout.tsx) mas a página nunca
// tinha sido criada — mesma situação do /master/billing e /master/tenants
// antes (13/07). Escopo mínimo por enquanto: dados da conta + troca de
// senha (reaproveitando /api/user/change-password, já usado no perfil do
// tenant).

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { MasterSettingsClient } from './settings-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Configurações — Master' }

export default async function MasterSettingsPage() {
  const session = await auth()
  if (session?.user?.role !== 'MASTER_ADMIN') redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, createdAt: true },
  })
  if (!user) redirect('/login')

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Dados da sua conta de administrador
        </p>
      </div>
      <MasterSettingsClient user={user} />
    </div>
  )
}
