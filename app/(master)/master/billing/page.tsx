// app/(master)/master/billing/page.tsx
//
// Faturamento — visão do dono do SaaS sobre a receita recorrente (MRR/ARR)
// e a lista de assinaturas, direto do banco (não depende de olhar o
// extrato do banco/Efí pra saber quem está pagando o quê).
//
// MRR normalizado: assinaturas ANUAIS guardam o valor total do ano em
// "amount" — dividimos por 12 aqui pra não inflar o MRR (bug que existia
// no card de MRR do /master/dashboard, que somava o amount cru).

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { formatCurrency } from '@/lib/utils/format'
import { TrendingUp, Users, AlertTriangle, XCircle, CreditCard } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Faturamento — Master' }
export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, string> = {
  TRIAL: 'Trial',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  SUSPENDED: 'Suspensa',
  CANCELLED: 'Cancelada',
}

const STATUS_STYLES: Record<string, string> = {
  TRIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  PAST_DUE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  SUSPENDED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const BILLING_CYCLE_LABELS: Record<string, string> = { MONTHLY: 'Mensal', ANNUAL: 'Anual' }

function monthlyEquivalent(amount: number, billingCycle: string) {
  return billingCycle === 'ANNUAL' ? amount / 12 : amount
}

export default async function MasterBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (session?.user?.role !== 'MASTER_ADMIN') redirect('/login')

  const { status: statusFilter } = await searchParams

  const [allActiveForMrr, subscriptions, statusCounts] = await Promise.all([
    // Pra calcular MRR/ARR certo, sempre olha TODAS as ativas (independente
    // do filtro da tabela abaixo).
    prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
      select: { amount: true, billingCycle: true },
    }),

    prisma.subscription.findMany({
      where: statusFilter ? { status: statusFilter as any } : undefined,
      orderBy: [{ status: 'asc' }, { currentPeriodEnd: 'asc' }],
      select: {
        id: true,
        status: true,
        plan: true,
        billingCycle: true,
        amount: true,
        cardLast4: true,
        currentPeriodEnd: true,
        cancelledAt: true,
        provider: true,
        tenant: { select: { name: true, slug: true } },
      },
    }),

    prisma.subscription.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ])

  const mrr = allActiveForMrr.reduce(
    (sum, s) => sum + monthlyEquivalent(Number(s.amount), s.billingCycle),
    0
  )
  const arr = mrr * 12

  const countsByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]))
  const totalSubscriptions = statusCounts.reduce((sum, s) => sum + s._count._all, 0)

  const filterOptions = [
    { value: undefined, label: 'Todas', count: totalSubscriptions },
    { value: 'ACTIVE', label: 'Ativas', count: countsByStatus.ACTIVE ?? 0 },
    { value: 'TRIAL', label: 'Trial', count: countsByStatus.TRIAL ?? 0 },
    { value: 'PAST_DUE', label: 'Pendentes', count: countsByStatus.PAST_DUE ?? 0 },
    { value: 'CANCELLED', label: 'Canceladas', count: countsByStatus.CANCELLED ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Faturamento</h1>
        <p className="text-muted-foreground text-sm">
          Receita recorrente da plataforma — direto do banco, sem precisar olhar o extrato do Efí/banco.
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-muted-foreground">MRR</p>
            <div className="p-2 rounded-lg text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(mrr)}</p>
          <p className="text-xs text-muted-foreground mt-1">ARR: {formatCurrency(arr)}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-muted-foreground">Assinaturas ativas</p>
            <div className="p-2 rounded-lg text-blue-600 bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{countsByStatus.ACTIVE ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">{countsByStatus.TRIAL ?? 0} em trial</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-muted-foreground">Pagamento pendente</p>
            <div className="p-2 rounded-lg text-amber-600 bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{countsByStatus.PAST_DUE ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">cartão recusado ou aguardando confirmação</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-muted-foreground">Canceladas</p>
            <div className="p-2 rounded-lg text-gray-500 bg-gray-100 dark:bg-gray-800">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{countsByStatus.CANCELLED ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">acesso mantido até o fim do período pago</p>
        </div>
      </div>

      {/* Tabela de assinaturas */}
      <div className="bg-card border border-border rounded-xl">
        <div className="p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground">Assinaturas</h2>
          <div className="flex flex-wrap gap-1.5">
            {filterOptions.map((opt) => (
              <a
                key={opt.label}
                href={opt.value ? `/master/billing?status=${opt.value}` : '/master/billing'}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
              >
                {opt.label} ({opt.count})
              </a>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Estabelecimento</th>
                <th className="px-5 py-3 font-medium">Plano</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Cartão</th>
                <th className="px-5 py-3 font-medium text-right">Valor</th>
                <th className="px-5 py-3 font-medium">
                  {statusFilter === 'CANCELLED' ? 'Acesso até' : 'Próxima cobrança'}
                </th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{s.tenant.name}</p>
                    <p className="text-xs text-muted-foreground">/{s.tenant.slug}</p>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {s.plan} · {BILLING_CYCLE_LABELS[s.billingCycle] ?? s.billingCycle}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLES[s.status] ?? ''}`}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {s.cardLast4 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5" /> •••• {s.cardLast4}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-foreground">
                    {formatCurrency(Number(s.amount))}
                    <span className="text-xs text-muted-foreground font-normal">
                      {s.billingCycle === 'ANNUAL' ? '/ano' : '/mês'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {new Date(s.currentPeriodEnd).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {subscriptions.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              Nenhuma assinatura encontrada para esse filtro.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
