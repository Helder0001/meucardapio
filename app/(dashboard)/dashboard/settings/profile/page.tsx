// app/(dashboard)/dashboard/settings/profile/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { ProfileForm } from './profile-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meu Perfil' }

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
    },
  })

  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Gerencie suas informações pessoais e senha
        </p>
      </div>
      <ProfileForm user={user} />
    </div>
  )
}
