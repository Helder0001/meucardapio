// app/(dashboard)/dashboard/settings/subscription/page.tsx
//
// Antes vivia como uma seção dentro de "Meu Perfil" — virou tela própria
// (13/07), acessível pelo menu do usuário, entre "Configurações" e "Sair".
// Adicionado também o extrato de pagamentos confirmados (SubscriptionPayment,
// alimentado pelo webhook da Efí a cada cobrança paga).

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { SubscriptionClient } from './subscription-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Assinatura' }
export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // Billing não é assunto de garçom/operador — só quem administra o
  // estabelecimento mexe na assinatura da plataforma.
  if (session.user.role !== 'TENANT_ADMIN' || !session.user.tenantId) {
    redirect('/dashboard')
  }

  const tenantId = session.user.tenantId

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    select: {
      id: true,
      status: true,
      plan: true,
      billingCycle: true,
      amount: true,
      cardLast4: true,
      currentPeriodEnd: true,
      cancelledAt: true,
    },
  })

  const payments = subscription
    ? await prisma.subscriptionPayment.findMany({
        where: { subscriptionId: subscription.id },
        orderBy: { paidAt: 'desc' },
        take: 36, // 3 anos de histórico mensal — mais que suficiente pra exibir
        select: {
          id: true,
          plan: true,
          billingCycle: true,
          amount: true,
          cardLast4: true,
          paidAt: true,
        },
      })
    : []

  // Prisma Decimal/Date não cruzam a fronteira Server->Client Component de
  // forma serializável — convertendo aqui antes de passar pro client.
  const subscriptionForClient = subscription
    ? {
        status: subscription.status,
        plan: subscription.plan,
        billingCycle: subscription.billingCycle,
        amount: Number(subscription.amount),
        cardLast4: subscription.cardLast4,
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        cancelledAt: subscription.cancelledAt?.toISOString() ?? null,
      }
    : null

  const paymentsForClient = payments.map((p) => ({
    id: p.id,
    plan: p.plan,
    billingCycle: p.billingCycle,
    amount: Number(p.amount),
    cardLast4: p.cardLast4,
    paidAt: p.paidAt.toISOString(),
  }))

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assinatura</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Gerencie sua assinatura do Meu Cardápio e veja o histórico de pagamentos
        </p>
      </div>
      <SubscriptionClient
        subscription={subscriptionForClient}
        payments={paymentsForClient}
        efiAccountIdentifier={process.env.NEXT_PUBLIC_EFI_ACCOUNT_IDENTIFIER ?? ''}
        efiSandbox={process.env.NEXT_PUBLIC_EFI_SANDBOX !== 'false'}
      />
    </div>
  )
}
