// app/(dashboard)/dashboard/financeiro/page.tsx
//
// Fluxo de Recebimentos — separa pagamentos confirmados em duas seções:
//   • "Com valor calculado": netAmount não é null — inclui PIX/Pix Chave/
//     Dinheiro (sempre), Mercado Pago e Asaas (dado real do provedor), e
//     Efí/maquininha SE o tenant tiver configurado a taxa deles.
//   • "Sem cálculo automático": netAmount é null — Efí/maquininha sem
//     taxa configurada ainda. Aparece só o valor bruto, com um aviso pra
//     configurar a taxa (ver FinanceRatesForm).
// Agrupar por "tem netAmount" em vez de por método fixo é o que permite
// cartão via Efí/maquininha aparecerem na seção calculada assim que o
// tenant configurar a taxa deles, sem mexer nessa página de novo.

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { FinanceiroClient } from '@/components/dashboard/financeiro-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Financeiro — Meu Cardápio' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ start?: string; end?: string }>
}

const toSpStart = (d: string) => new Date(d + 'T00:00:00-03:00')
const toSpEnd   = (d: string) => new Date(d + 'T23:59:59-03:00')

function startOfMonthSP(): Date {
  const now = new Date()
  const sp  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return toSpStart(`${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, '0')}-01`)
}

export default async function FinanceiroPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const tenantId = session.user.tenantId
  const params = await searchParams

  const startDate = params.start || startOfMonthSP().toISOString().slice(0, 10)
  const endDate   = params.end   || new Date().toISOString().slice(0, 10)

  const dateWhere = { paidAt: { gte: toSpStart(startDate), lte: toSpEnd(endDate) } }

  const [allPayments, tenantRow] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId, status: 'PAID', ...dateWhere },
      select: {
        id: true, method: true, provider: true, amount: true, fee: true, netAmount: true,
        expectedReceiptDate: true, paidAt: true,
        order: { select: { orderNumber: true, customer: { select: { name: true } } } },
      },
      orderBy: { paidAt: 'desc' },
    }),
    prisma.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
  ])

  const calculatedPayments = allPayments.filter((p) => p.netAmount !== null)
  const uncalculatedPayments = allPayments.filter((p) => p.netAmount === null)

  const calculatedTotal   = calculatedPayments.reduce((s, p) => s + Number(p.netAmount), 0)
  const uncalculatedTotal = uncalculatedPayments.reduce((s, p) => s + Number(p.amount), 0)

  const financeRates = (tenantRow?.settings as any)?.financeRates ?? {}

  return (
    <FinanceiroClient
      startDate={startDate}
      endDate={endDate}
      instantPayments={calculatedPayments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount),
        fee: p.fee !== null ? Number(p.fee) : null,
        netAmount: Number(p.netAmount),
        expectedReceiptDate: p.expectedReceiptDate?.toISOString() ?? null,
        paidAt: p.paidAt!.toISOString(),
        orderNumber: p.order.orderNumber,
        customerName: p.order.customer?.name ?? null,
      }))}
      cardPayments={uncalculatedPayments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount),
        paidAt: p.paidAt!.toISOString(),
        orderNumber: p.order.orderNumber,
        customerName: p.order.customer?.name ?? null,
      }))}
      instantTotal={calculatedTotal}
      cardTotal={uncalculatedTotal}
      financeRates={financeRates}
    />
  )
}
