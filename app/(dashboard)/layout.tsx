// app/(dashboard)/layout.tsx
//
// Layout compartilhado por todas as páginas do dashboard.
// Server Component: verifica autenticação básica.
//
// CORREÇÃO: a restrição de rotas por papel (STAFF/DELIVERY_PERSON só podem
// acessar /dashboard e /dashboard/orders/**) foi movida para middleware.ts,
// que roda no Edge antes da renderização e tem acesso confiável ao
// pathname — a abordagem anterior, baseada em headers() dentro do layout,
// não funcionava de forma confiável sem um middleware definindo esses
// headers, então garçons conseguiam acessar Relatórios, Configurações,
// Mesas etc. diretamente pela URL.

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { InactivityWarning } from '@/components/shared/inactivity-warning'
import Script from 'next/script'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')
  if (!session.user.tenantId && session.user.role !== 'MASTER_ADMIN') redirect('/login')

  // CORREÇÃO: o status da assinatura só era checado no momento do login
  // (lib/auth/config.ts). Uma sessão já aberta (JWT válido) continuava
  // acessando o dashboard normalmente mesmo depois do trial vencer ou do
  // tenant ser suspenso, já que nada revalidava isso a cada request. Aqui
  // buscamos o status atual direto no banco (sempre fresco, sem cache) e
  // derrubamos o acesso imediatamente quando necessário — sem depender do
  // cron de suspensão, que só roda 1x por dia.
  if (session.user.role !== 'MASTER_ADMIN' && session.user.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { subscriptionStatus: true, trialEndsAt: true },
    })

    const trialExpired =
      tenant?.subscriptionStatus === 'TRIAL' &&
      !!tenant.trialEndsAt &&
      tenant.trialEndsAt < new Date()

    if (tenant?.subscriptionStatus === 'SUSPENDED' || trialExpired) {
      redirect('/assinatura')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/*
        Script de segurança do Mercado Pago — gera Device ID
        (window.MP_DEVICE_SESSION_ID) usado ao criar PIX no fluxo de pedido
        balcão/kanban, reduzindo recusas de antifraude.
      */}
      <Script src="https://www.mercadopago.com/v2/security.js" strategy="afterInteractive" {...({ view: 'checkout' } as any)} />
      <Sidebar
        userRole={session.user.role}
        tenantSlug={session.user.tenantSlug ?? ''}
        plan={session.user.plan ?? 'STARTER'}
      />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header user={session.user} />
        <main className="flex-1 overflow-y-auto">
          <div className="container-app py-4 md:py-6 pb-24 md:pb-6">
            {children}
          </div>
        </main>
      </div>
      <InactivityWarning />
    </div>
  )
}
