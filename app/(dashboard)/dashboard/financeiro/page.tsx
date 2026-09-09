// app/(dashboard)/dashboard/financeiro/page.tsx
//
// Fluxo de Recebimentos — combina pagamentos já confirmados (PIX, PIX
// Chave e Dinheiro entram na hora, sem taxa) com os pagamentos em
// cartão (maquininha ou online), que aparecem numa seção separada só
// com o valor bruto, sem taxa nem data prevista (ver justificativa em
// lib/finance/compute-receipt.ts).

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { FinanceiroClient } from '@/components/dashboard/financeiro-client'
import type { Metadata } from 'next'
import type { PaymentMethod } from '@prisma/client'

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

const CARD_METHODS: PaymentMethod[] = ['CREDIT_CARD', 'CREDIT_CARD_MANUAL', 'DEBIT_CARD']
const INSTANT_METHODS: PaymentMethod[] = ['PIX', 'PIX_MANUAL', 'CASH']

export default async function FinanceiroPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const tenantId = session.user.tenantId
  const params = await searchParams

  const startDate = params.start || startOfMonthSP().toISOString().slice(0, 10)
  const endDate   = params.end   || new Date().toISOString().slice(0, 10)

  const dateWhere = { paidAt: { gte: toSpStart(startDate), lte: toSpEnd(endDate) } }

  // ── Recebidos na hora (PIX, PIX Chave, Dinheiro) — com taxa/líquido/data ──
  const instantPayments = await prisma.payment.findMany({
    where: { tenantId, status: 'PAID', method: { in: INSTANT_METHODS }, ...dateWhere },
    select: {
      id: true, method: true, amount: true, fee: true, netAmount: true,
      expectedReceiptDate: true, paidAt: true,
      order: { select: { orderNumber: true, customer: { select: { name: true } } } },
    },
    orderBy: { paidAt: 'desc' },
  })

  // ── Cartão (maquininha ou online) — só valor bruto, sem taxa/data ──
  const cardPayments = await prisma.payment.findMany({
    where: { tenantId, status: 'PAID', method: { in: CARD_METHODS }, ...dateWhere },
    select: {
      id: true, method: true, amount: true, paidAt: true,
      order: { select: { orderNumber: true, customer: { select: { name: true } } } },
    },
    orderBy: { paidAt: 'desc' },
  })

  const instantTotal = instantPayments.reduce((s, p) => s + Number(p.netAmount ?? p.amount), 0)
  const cardTotal     = cardPayments.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <FinanceiroClient
      startDate={startDate}
      endDate={endDate}
      instantPayments={instantPayments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount),
        fee: p.fee !== null ? Number(p.fee) : null,
        netAmount: p.netAmount !== null ? Number(p.netAmount) : null,
        expectedReceiptDate: p.expectedReceiptDate?.toISOString() ?? null,
        paidAt: p.paidAt!.toISOString(),
        orderNumber: p.order.orderNumber,
        customerName: p.order.customer?.name ?? null,
      }))}
      cardPayments={cardPayments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount),
        paidAt: p.paidAt!.toISOString(),
        orderNumber: p.order.orderNumber,
        customerName: p.order.customer?.name ?? null,
      }))}
      instantTotal={instantTotal}
      cardTotal={cardTotal}
    />
  )
}
