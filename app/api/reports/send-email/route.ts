// app/api/reports/send-email/route.ts
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { hasPermission, type UserRole } from '@/lib/auth/permissions'
import { prisma } from '@/lib/db/client'
import { Resend } from 'resend'
import { z } from 'zod'
import { escapeHtml } from '@/lib/security/sanitize'

const resend = new Resend(process.env.RESEND_API_KEY)

const METHOD_PT: Record<string, string> = {
  CASH: 'Dinheiro', CREDIT_CARD: 'Cartão de Crédito', CREDIT_CARD_MANUAL: 'Crédito (entrega/retirada)',
  DEBIT_CARD: 'Cartão de Débito', PIX: 'PIX', VOUCHER: 'Voucher',
}
const TYPE_PT: Record<string, string> = {
  TABLE: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Retirada', PDV: 'Balcão',
}
const STATUS_PT: Record<string, string> = {
  PENDING: 'Aguardando', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto', DELIVERED: 'Entregue', CANCELLED: 'Cancelado', REFUNDED: 'Reembolsado',
}
const PAYMENT_STATUS_PT: Record<string, string> = {
  PENDING: 'Pendente', PAID: 'Pago', FAILED: 'Falhou', REFUNDED: 'Reembolsado',
}

const fmtCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (d: Date) =>
  new Date(d).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

const bodySchema = z.object({
  to: z.string().email('E-mail inválido'),
  type: z.enum(['orders', 'products']).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inicial inválida').optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data final inválida').optional(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // VULN-ALTA-05 CORRIGIDO: ver mesma correção em reports/export/route.ts
  if (!hasPermission(session.user.role as UserRole, 'reports:export')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { to, type, start, end } = parsed.data

  const tenantId   = session.user.tenantId
  const tenant     = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } })
  const tenantName = tenant?.name ?? 'Estabelecimento'

  const dateFilter = {
    ...(start ? { gte: new Date(start) } : {}),
    ...(end   ? { lte: new Date(end + 'T23:59:59') } : {}),
  }
  const hasDate    = Object.keys(dateFilter).length > 0
  const periodLabel = start && end
    ? `${new Date(start).toLocaleDateString('pt-BR')} a ${new Date(end).toLocaleDateString('pt-BR')}`
    : 'Todo o período'

  let subject = ''
  let html    = ''

  if (!type || type === 'orders') {
    const orders = await prisma.order.findMany({
      where: { tenantId, ...(hasDate ? { createdAt: dateFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        orderNumber: true, status: true, paymentStatus: true, type: true,
        total: true, createdAt: true,
        customer: { select: { name: true } },
        payments: { select: { method: true } },
      },
    })
    const totalRevenue = orders
      .filter(o => !['CANCELLED','REFUNDED'].includes(o.status))
      .reduce((s, o) => s + Number(o.total), 0)
    const paid = orders.filter(o => !['CANCELLED','REFUNDED'].includes(o.status)).length

    const rows = orders.slice(0, 100).map(o => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">#${String(o.orderNumber).padStart(4,'0')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${fmtDate(o.createdAt)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${escapeHtml(o.customer?.name) || '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${TYPE_PT[o.type] ?? o.type}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${STATUS_PT[o.status] ?? o.status}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${PAYMENT_STATUS_PT[o.paymentStatus] ?? o.paymentStatus}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${o.payments.map(p => METHOD_PT[p.method] ?? p.method).join(', ')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:bold">${fmtCurrency(Number(o.total))}</td>
      </tr>`).join('')

    subject = `📊 Relatório de Pedidos — ${tenantName} (${periodLabel})`
    html = buildEmailHtml({
      tenantName, title: 'Relatório de Pedidos', period: periodLabel,
      stats: [
        { label: 'Total de Pedidos', value: String(orders.length) },
        { label: 'Faturamento', value: fmtCurrency(totalRevenue) },
        { label: 'Ticket Médio', value: fmtCurrency(paid > 0 ? totalRevenue / paid : 0) },
      ],
      tableHeaders: ['Nº', 'Data', 'Cliente', 'Tipo', 'Status', 'Pgto', 'Método', 'Total'],
      tableRows: rows,
      note: orders.length > 100 ? `Exibindo os 100 primeiros de ${orders.length} pedidos.` : undefined,
    })
  }

  if (type === 'products') {
    const items = await prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      where: { order: { tenantId, status: { notIn: ['CANCELLED','REFUNDED'] }, ...(hasDate ? { createdAt: dateFilter } : {}) } },
      _sum: { quantity: true, totalPrice: true },
      _count: { id: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 50,
    })
    const totalRev = items.reduce((s, i) => s + Number(i._sum.totalPrice ?? 0), 0)
    const totalQty = items.reduce((s, i) => s + (i._sum.quantity ?? 0), 0)

    const rows = items.map((item, i) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:bold;color:#f97316">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${escapeHtml(item.productName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:bold">${item._sum.quantity ?? 0}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:bold">${fmtCurrency(Number(item._sum.totalPrice ?? 0))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:center">${item._count.id}</td>
      </tr>`).join('')

    subject = `📦 Relatório de Produtos — ${tenantName} (${periodLabel})`
    html = buildEmailHtml({
      tenantName, title: 'Relatório de Produtos', period: periodLabel,
      stats: [
        { label: 'Produtos únicos', value: String(items.length) },
        { label: 'Unidades vendidas', value: String(totalQty) },
        { label: 'Receita total', value: fmtCurrency(totalRev) },
      ],
      tableHeaders: ['#', 'Produto', 'Qtd', 'Receita', 'Pedidos'],
      tableRows: rows,
    })
  }

  try {
    await resend.emails.send({
      from: `${tenantName} via Meu Cardápio <onboarding@resend.dev>`,
      to: [to],
      subject,
      html,
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[reports/send-email]', err)
    return NextResponse.json({ error: 'Falha ao enviar e-mail. Verifique RESEND_API_KEY.' }, { status: 500 })
  }
}

function buildEmailHtml({ tenantName, title, period, stats, tableHeaders, tableRows, note }: {
  tenantName: string; title: string; period: string
  stats: Array<{ label: string; value: string }>
  tableHeaders: string[]; tableRows: string; note?: string
}) {
  const statsHtml = stats.map(s => `
    <div style="flex:1;min-width:140px;text-align:center;padding:16px;background:#f9f9f9;border-radius:8px">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.05em">${s.label}</div>
      <div style="font-size:20px;font-weight:bold;color:#111;margin-top:4px">${s.value}</div>
    </div>`).join('')

  const headersHtml = tableHeaders.map(h =>
    `<th style="background:#f3f4f6;padding:8px;text-align:left;font-size:11px;color:#555;text-transform:uppercase;border-bottom:2px solid #e5e7eb">${h}</th>`
  ).join('')

  const tenantNameSafe = escapeHtml(tenantName)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ${tenantNameSafe}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <div style="max-width:700px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <div style="background:#f97316;padding:24px 32px">
      <div style="font-size:22px;font-weight:bold;color:#fff">${tenantNameSafe}</div>
      <div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:4px">${title} • ${period}</div>
    </div>
    <div style="padding:24px 32px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">${statsHtml}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${headersHtml}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${note ? `<p style="margin-top:12px;font-size:11px;color:#888">${note}</p>` : ''}
    </div>
    <div style="background:#f9f9f9;padding:16px 32px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee">
      Gerado em ${new Date().toLocaleDateString('pt-BR')} pelo <strong>Meu Cardápio</strong> ·
      <a href="https://meucardapio-teal.vercel.app/dashboard/reports" style="color:#f97316;text-decoration:none">Ver no painel</a>
    </div>
  </div>
</body>
</html>`
}
