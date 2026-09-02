// app/api/cron/reports/route.ts
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { Resend } from 'resend'
import { isValidCronSecretHeader } from '@/lib/security/cron-auth'

const resend = new Resend(process.env.RESEND_API_KEY)
const TYPE_PT: Record<string, string> = { TABLE:'Mesa', DELIVERY:'Delivery', PICKUP:'Retirada', PDV:'Balcão' }
const STATUS_PT: Record<string, string> = { PENDING:'Aguardando', CONFIRMED:'Confirmado', PREPARING:'Preparando', READY:'Pronto', DELIVERED:'Entregue', CANCELLED:'Cancelado', REFUNDED:'Reembolsado' }
const fmtCurrency = (v: number) => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const FREQ_LABEL: Record<string, string> = { DAILY:'Diário', WEEKLY:'Semanal', MONTHLY:'Mensal' }

export async function GET(request: Request) {
  // VULN-BAIXA-07 CORRIGIDO: comparação direta (!==) trocada por
  // isValidCronSecretHeader(), que usa crypto.timingSafeEqual — mesmo
  // padrão agora usado nos 4 endpoints de cron.
  if (!isValidCronSecretHeader(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now  = new Date()
  const sp   = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hour = sp.getHours()
  const dow  = sp.getDay()

  let processed = 0, errors = 0

  const schedules = await (prisma as any).reportSchedule.findMany({
    where: { isActive: true, hour },
    include: { tenant: { select: { name: true } } },
  }).catch(() => [])

  for (const s of schedules) {
    if (s.frequency === 'WEEKLY' && s.dayOfWeek !== dow) continue
    if (s.frequency === 'MONTHLY' && sp.getDate() !== 1) continue
    try { await sendReport(s, sp); processed++ }
    catch (e) { console.error('[cron/reports]', s.id, e); errors++ }
  }

  return NextResponse.json({ ok: true, processed, errors })
}

async function sendReport(schedule: any, sp: Date) {
  const tenantName = schedule.tenant?.name ?? 'Estabelecimento'
  let start: Date
  if (schedule.frequency === 'DAILY') {
    start = new Date(sp); start.setDate(sp.getDate()-1); start.setHours(0,0,0,0)
  } else if (schedule.frequency === 'WEEKLY') {
    start = new Date(sp); start.setDate(sp.getDate()-7); start.setHours(0,0,0,0)
  } else {
    start = new Date(sp.getFullYear(), sp.getMonth()-1, 1)
  }
  const end = new Date(sp); end.setHours(23,59,59,999)
  if (schedule.frequency !== 'DAILY') end.setDate(end.getDate()-1)

  const period = `${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`
  const df     = { gte: start, lte: end }

  let subject = '', html = ''

  if (schedule.reportType === 'orders') {
    const orders = await prisma.order.findMany({
      where: { tenantId: schedule.tenantId, createdAt: df },
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { orderNumber:true, status:true, type:true, total:true, createdAt:true, customer:{select:{name:true}} },
    })
    const rev  = orders.filter(o => !['CANCELLED','REFUNDED'].includes(o.status)).reduce((s,o) => s+Number(o.total),0)
    const paid = orders.filter(o => !['CANCELLED','REFUNDED'].includes(o.status)).length
    const rows = orders.slice(0,50).map(o =>
      `<tr><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">#${String(o.orderNumber).padStart(4,'0')}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${new Date(o.createdAt).toLocaleDateString('pt-BR')}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${o.customer?.name??'—'}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${TYPE_PT[o.type]??o.type}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${STATUS_PT[o.status]??o.status}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:bold">${fmtCurrency(Number(o.total))}</td></tr>`
    ).join('')
    subject = `📊 Relatório ${FREQ_LABEL[schedule.frequency]} — ${tenantName}`
    html = buildHtml(tenantName, `Pedidos ${FREQ_LABEL[schedule.frequency]}`, period,
      [{label:'Pedidos',value:String(orders.length)},{label:'Faturamento',value:fmtCurrency(rev)},{label:'Ticket Médio',value:fmtCurrency(paid>0?rev/paid:0)}],
      ['Nº','Data','Cliente','Tipo','Status','Total'], rows, orders.length>50?`Exibindo 50 de ${orders.length}`:undefined)
  }

  if (schedule.reportType === 'products') {
    const items = await prisma.orderItem.groupBy({
      by:['productId','productName'],
      where:{order:{tenantId:schedule.tenantId,status:{notIn:['CANCELLED','REFUNDED']},createdAt:df}},
      _sum:{quantity:true,totalPrice:true}, _count:{id:true},
      orderBy:{_sum:{quantity:'desc'}}, take:30,
    })
    const totalRev = items.reduce((s,i)=>s+Number(i._sum.totalPrice??0),0)
    const totalQty = items.reduce((s,i)=>s+(i._sum.quantity??0),0)
    const rows = items.map((item,i) =>
      `<tr><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:center;color:#f97316;font-weight:bold">${i+1}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${item.productName}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:bold">${item._sum.quantity??0}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:bold">${fmtCurrency(Number(item._sum.totalPrice??0))}</td></tr>`
    ).join('')
    subject = `📦 Produtos ${FREQ_LABEL[schedule.frequency]} — ${tenantName}`
    html = buildHtml(tenantName, `Produtos ${FREQ_LABEL[schedule.frequency]}`, period,
      [{label:'Produtos',value:String(items.length)},{label:'Unidades',value:String(totalQty)},{label:'Receita',value:fmtCurrency(totalRev)}],
      ['#','Produto','Qtd','Receita'], rows)
  }

  await resend.emails.send({
    from: `${tenantName} via Meu Cardápio <onboarding@resend.dev>`,
    to: [schedule.email], subject, html,
  })
  await (prisma as any).reportSchedule.update({ where:{id:schedule.id}, data:{lastSentAt:new Date()} })
}

function buildHtml(name:string, title:string, period:string, stats:any[], headers:string[], rows:string, note?:string) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif"><div style="max-width:650px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden"><div style="background:#f97316;padding:20px 28px"><div style="font-size:20px;font-weight:bold;color:#fff">${name}</div><div style="font-size:12px;color:rgba(255,255,255,.8);margin-top:2px">${title} • ${period}</div></div><div style="padding:20px 28px"><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">${stats.map(s=>`<div style="flex:1;min-width:110px;text-align:center;padding:12px;background:#f9f9f9;border-radius:8px"><div style="font-size:10px;color:#888;text-transform:uppercase">${s.label}</div><div style="font-size:18px;font-weight:bold;margin-top:2px">${s.value}</div></div>`).join('')}</div><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>${headers.map(h=>`<th style="background:#f3f4f6;padding:7px 8px;text-align:left;font-size:11px;color:#555;text-transform:uppercase;border-bottom:2px solid #e5e7eb">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>${note?`<p style="margin-top:10px;font-size:11px;color:#888">${note}</p>`:''}</div><div style="background:#f9f9f9;padding:14px 28px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee">Gerado automaticamente em ${new Date().toLocaleDateString('pt-BR')} pelo <strong>Meu Cardápio</strong></div></div></body></html>`
}
