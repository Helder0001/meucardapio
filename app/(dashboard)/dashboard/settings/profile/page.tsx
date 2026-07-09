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

  // Assinatura da plataforma (Plano PRO) — só faz sentido buscar/exibir pra
  // quem tem tenant e é TENANT_ADMIN (billing não é assunto de garçom).
  const subscription =
    session.user.role === 'TENANT_ADMIN' && session.user.tenantId
      ? await prisma.subscription.findUnique({
          where: { tenantId: session.user.tenantId },
          select: {
            status: true,
            plan: true,
            billingCycle: true,
            amount: true,
            currentPeriodEnd: true,
            cancelledAt: true,
          },
        })
      : null

  // Prisma Decimal/Date não cruzam a fronteira Server->Client Component de
  // forma serializável — convertendo aqui antes de passar pro ProfileForm.
  const subscriptionForClient = subscription
    ? {
        status: subscription.status,
        plan: subscription.plan,
        billingCycle: subscription.billingCycle,
        amount: Number(subscription.amount),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        cancelledAt: subscription.cancelledAt?.toISOString() ?? null,
      }
    : null

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Gerencie suas informações pessoais e senha
        </p>
      </div>
      <ProfileForm user={user} subscription={subscriptionForClient} />
    </div>
  )
}
