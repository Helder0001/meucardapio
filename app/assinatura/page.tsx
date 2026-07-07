// app/assinatura/page.tsx
//
// Página INTENCIONALMENTE fora do grupo (dashboard) — não deve herdar o
// layout do dashboard, já que é justamente para onde o layout do dashboard
// redireciona quando o tenant está com trial vencido ou suspenso. Se ficasse
// dentro de (dashboard), o próprio check de assinatura criaria um loop de
// redirecionamento.

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { SubscriptionCardForm } from './subscription-card-form'
import { SignOutLink } from './sign-out-link'

const PLAN_PRICE_MONTHLY = 1.00

export default async function AssinaturaPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'MASTER_ADMIN') redirect('/master/dashboard')
  if (!session.user.tenantId) redirect('/login')

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true, subscriptionStatus: true, trialEndsAt: true },
  })

  if (!tenant) redirect('/login')

  // Se por algum motivo o status já estiver ok (ex.: pagamento confirmado
  // em outra aba, ou cron ainda não rodou mas o trial não venceu de fato),
  // manda direto pro dashboard em vez de mostrar a cobrança.
  const trialExpired =
    tenant.subscriptionStatus === 'TRIAL' &&
    !!tenant.trialEndsAt &&
    tenant.trialEndsAt < new Date()

  if (tenant.subscriptionStatus !== 'SUSPENDED' && !trialExpired) {
    redirect('/dashboard')
  }

  const trialEndsAtLabel = tenant.trialEndsAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(tenant.trialEndsAt)
    : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-neutral-200 p-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
          <span className="text-2xl">⏰</span>
        </div>

        <h1 className="text-xl font-semibold text-neutral-900">
          Seu período grátis acabou
        </h1>

        <p className="mt-2 text-sm text-neutral-600">
          {trialEndsAtLabel
            ? `O teste grátis do ${tenant.name} venceu em ${trialEndsAtLabel}.`
            : `O acesso do ${tenant.name} está suspenso por falta de pagamento.`}{' '}
          Para continuar usando o Meu Cardápio, ative sua assinatura do Plano PRO.
        </p>

        <div className="mt-6">
          <SubscriptionCardForm
            amount={PLAN_PRICE_MONTHLY}
            publicKey={process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''}
          />
        </div>

        <p className="mt-4 text-xs text-neutral-400">
          Assinatura mensal — cobrança automática no cartão a cada 30 dias.
        </p>

        <div className="mt-6 border-t border-neutral-100 pt-4">
          <SignOutLink />
        </div>
      </div>
    </div>
  )
}
