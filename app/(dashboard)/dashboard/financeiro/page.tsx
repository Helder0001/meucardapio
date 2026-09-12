// app/(dashboard)/dashboard/financeiro/page.tsx
//
// Fluxo de Recebimentos — separa pagamentos confirmados em três grupos:
//   • "Recebido": netAmount calculado E Data do Crédito já chegou (hoje
//     ou antes).
//   • "A receber": netAmount calculado, mas Data do Crédito é no futuro
//     — o dinheiro ainda não caiu, só está previsto.
//   • "Sem cálculo automático": netAmount é null — Efí/maquininha sem
//     taxa configurada ainda, não dá pra saber nem o valor líquido nem
//     quando cai. Aparece só o valor bruto, com aviso pra configurar a
//     taxa (ver FinanceRatesForm).
// Agrupar por "tem netAmount" + "Data do Crédito vencida ou não" é o que
// permite cartão via Efí/maquininha aparecer certo assim que o tenant
// configurar a taxa deles, sem mexer nessa página de novo.

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { FinanceiroClient } from '@/components/dashboard/financeiro-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Financeiro — Meu Cardápio' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    start?: string; end?: string
    // CORREÇÃO (#2): qual data o período De/Até filtra — "venda" (paidAt)
    // ou "credito" (expectedReceiptDate). Default 'venda' pra manter o
    // comportamento de antes pra quem não mexeu no filtro novo.
    dateField?: 'venda' | 'credito'
    orderNumber?: string
    method?: string
  }>
}

const toSpStart = (d: string) => new Date(d + 'T00:00:00-03:00')
const toSpEnd   = (d: string) => new Date(d + 'T23:59:59-03:00')

function startOfMonthSP(): Date {
  const now = new Date()
  const sp  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return toSpStart(`${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, '0')}-01`)
}

function todaySP(): string {
  const now = new Date()
  const sp  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return `${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, '0')}-${String(sp.getDate()).padStart(2, '0')}`
}

export default async function FinanceiroPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const tenantId = session.user.tenantId
  const params = await searchParams

  const startDate = params.start || startOfMonthSP().toISOString().slice(0, 10)
  const endDate   = params.end   || new Date().toISOString().slice(0, 10)
  const dateField = params.dateField === 'credito' ? 'credito' : 'venda'
  const orderNumber = params.orderNumber?.trim() || ''
  const method = params.method || ''

  // CORREÇÃO (#2): filtro de período agora pode ser aplicado em cima da
  // Data da Venda (paidAt) OU da Data do Crédito (expectedReceiptDate),
  // conforme escolhido no select ao lado do período.
  const dateWhere = dateField === 'credito'
    ? { expectedReceiptDate: { gte: toSpStart(startDate), lte: toSpEnd(endDate) } }
    : { paidAt: { gte: toSpStart(startDate), lte: toSpEnd(endDate) } }

  const orderNumberInt = /^\d+$/.test(orderNumber) ? parseInt(orderNumber, 10) : null

  const [allPayments, tenantRow] = await Promise.all([
    prisma.payment.findMany({
      where: {
        tenantId, status: 'PAID', ...dateWhere,
        ...(method ? { method } : {}),
        ...(orderNumberInt !== null ? { order: { orderNumber: orderNumberInt } } : {}),
      },
      select: {
        id: true, method: true, provider: true, amount: true, fee: true, netAmount: true,
        expectedReceiptDate: true, paidAt: true,
        order: { select: { orderNumber: true, customer: { select: { name: true } } } },
      },
      orderBy: { paidAt: 'desc' },
    }),
    prisma.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
  ])

  const calculatedPayments   = allPayments.filter((p) => p.netAmount !== null)
  const uncalculatedPayments = allPayments.filter((p) => p.netAmount === null)

  // CORREÇÃO (#1): dentro dos calculados, separa quem já caiu de quem
  // ainda está previsto — comparando a Data do Crédito com o fim do dia
  // de hoje (horário de Brasília). "Hoje ou antes" = já recebido.
  const cutoff = toSpEnd(todaySP())
  const receivedPayments  = calculatedPayments.filter((p) => p.expectedReceiptDate !== null && p.expectedReceiptDate <= cutoff)
  const upcomingPayments  = calculatedPayments.filter((p) => p.expectedReceiptDate !== null && p.expectedReceiptDate > cutoff)

  const receivedTotal     = receivedPayments.reduce((s, p) => s + Number(p.netAmount), 0)
  const upcomingTotal     = upcomingPayments.reduce((s, p) => s + Number(p.netAmount), 0)
  const uncalculatedTotal = uncalculatedPayments.reduce((s, p) => s + Number(p.amount), 0)

  const financeRates = (tenantRow?.settings as any)?.financeRates ?? {}

  const mapRow = (p: (typeof allPayments)[number]) => ({
    id: p.id,
    method: p.method,
    amount: Number(p.amount),
    fee: p.fee !== null ? Number(p.fee) : null,
    netAmount: p.netAmount !== null ? Number(p.netAmount) : null,
    expectedReceiptDate: p.expectedReceiptDate?.toISOString() ?? null,
    paidAt: p.paidAt!.toISOString(),
    orderNumber: p.order.orderNumber,
    customerName: p.order.customer?.name ?? null,
  })

  return (
    <FinanceiroClient
      startDate={startDate}
      endDate={endDate}
      dateField={dateField}
      orderNumber={orderNumber}
      method={method}
      receivedPayments={receivedPayments.map(mapRow)}
      upcomingPayments={upcomingPayments.map(mapRow)}
      uncalculatedPayments={uncalculatedPayments.map(mapRow)}
      receivedTotal={receivedTotal}
      upcomingTotal={upcomingTotal}
      uncalculatedTotal={uncalculatedTotal}
      financeRates={financeRates}
    />
  )
}
