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
import Image from 'next/image'
import { AlarmClock, Lock, ShieldCheck } from 'lucide-react'

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
  //
  // CORREÇÃO: antes checava só `!== 'SUSPENDED'`, então PAST_DUE (ou
  // CANCELLED) mandava de volta pro /dashboard — que por sua vez bloqueia
  // qualquer status que não seja ACTIVE/TRIAL válido e redireciona de volta
  // pra cá, gerando loop infinito. Agora espelha exatamente a mesma regra
  // do layout do dashboard: só volta pro /dashboard se ACTIVE ou TRIAL
  // ainda dentro do prazo.
  const trialExpired =
    tenant.subscriptionStatus === 'TRIAL' &&
    !!tenant.trialEndsAt &&
    tenant.trialEndsAt < new Date()

  const hasValidAccess =
    tenant.subscriptionStatus === 'ACTIVE' ||
    (tenant.subscriptionStatus === 'TRIAL' && !trialExpired)

  if (hasValidAccess) {
    redirect('/dashboard')
  }

  const trialEndsAtLabel = tenant.trialEndsAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(tenant.trialEndsAt)
    : null

  return (
    <div className="min-h-screen relative overflow-hidden bg-neutral-50 flex flex-col items-center px-4 py-10 sm:py-14">
      {/* CORREÇÃO (design): mesh gradient sutil de fundo, mesma linguagem
          visual usada em /login e /register — antes a tela era só um cinza
          liso sem nenhuma identidade da marca. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-brand-300/30 blur-3xl" />
        <div className="absolute top-1/4 -right-24 w-96 h-96 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-[28rem] h-[28rem] rounded-full bg-brand-200/30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md flex flex-col items-center">
        {/* CORREÇÃO: essa página usa cores fixas (neutral-*), sempre em tema
            claro — nunca herda o layout do dashboard. Usar o <AuthLogo>
            compartilhado quebrava isso: ele pinta o texto com o token
            "foreground", que no modo escuro do dispositivo vira quase
            branco, deixando "Meu Cardápio" praticamente invisível sobre o
            fundo claro. Aqui a marca é montada com cor fixa (neutral-800),
            igual ao resto da tela, pra não depender do tema do sistema. */}
        <div className="mb-6 flex items-center gap-2">
          <div className="w-8 h-8 relative flex-shrink-0">
            <Image
              src="/logo-icon.png"
              alt="Meu Cardápio"
              fill
              sizes="32px"
              className="object-contain"
            />
          </div>
          <span className="font-semibold text-lg text-neutral-800">Meu Cardápio</span>
        </div>

        <div className="w-full bg-white rounded-3xl shadow-modal border border-neutral-100 overflow-hidden">
          {/* Faixa superior com o aviso — separada do corpo pra dar mais
              hierarquia visual em vez de tudo centralizado num bloco só */}
          <div className="bg-gradient-to-br from-brand-500 to-brand-600 px-6 sm:px-8 pt-7 pb-8 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
              <AlarmClock className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">
              Seu período grátis acabou
            </h1>
            <p className="mt-2 text-sm text-brand-50/90 leading-relaxed">
              {tenant.subscriptionStatus === 'CANCELLED'
                ? `A assinatura do ${tenant.name} foi cancelada e o período pago já terminou.`
                : trialEndsAtLabel
                  ? `O teste grátis do ${tenant.name} venceu em ${trialEndsAtLabel}.`
                  : `O acesso do ${tenant.name} está suspenso por falta de pagamento.`}{' '}
              Escolha um plano abaixo para reativar o acesso na hora.
            </p>
          </div>

          <div className="px-6 sm:px-8 py-6">
            <SubscriptionCardForm
              accountIdentifier={process.env.NEXT_PUBLIC_EFI_ACCOUNT_IDENTIFIER ?? ''}
              sandbox={process.env.NEXT_PUBLIC_EFI_SANDBOX !== 'false'}
            />
          </div>

          <div className="px-6 sm:px-8 pb-6 flex items-center justify-center gap-4 text-[11px] text-neutral-400">
            <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Pagamento criptografado</span>
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Cancele quando quiser</span>
          </div>
        </div>

        <div className="mt-6">
          <SignOutLink />
        </div>
      </div>
    </div>
  )
}
