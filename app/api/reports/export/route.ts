// app/api/reports/export/route.ts
// Exportação em XLSX (real) e PDF (HTML para print)
//
// VULN-NEW-02 CORRIGIDO: validação de formato de datas com Zod antes de qualquer uso.
// VULN-NEW-01 CORRIGIDO: $queryRaw usa Prisma.sql para parametrizar datas,
//   eliminando a interpolação direta de strings não confiáveis em SQL.

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth/session'
import { hasPermission, type UserRole } from '@/lib/auth/permissions'
import { prisma } from '@/lib/db/client'
import { formatCurrency, formatDate, formatOrderNumber } from '@/lib/utils/format'
import { escapeHtml } from '@/lib/security/sanitize'

// Validação estrita de formato de data (YYYY-MM-DD).
// Impede que strings arbitrárias cheguem ao banco via $queryRaw ou new Date().
const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido — use YYYY-MM-DD')
  .nullable()
  .optional()


const METHOD_PT: Record<string, string> = {
  CASH:               'Dinheiro',
  CREDIT_CARD:        'Cartão de Crédito',
  CREDIT_CARD_MANUAL: 'Crédito (entrega/retirada)',
  DEBIT_CARD:         'Cartão de Débito',
  PIX:                'PIX',
  VOUCHER:            'Voucher',
  CASHBACK:           'Cashback',
  TRANSFER:           'Transferência',
}

const STATUS_PT: Record<string, string> = {
  PENDING:          'Pendente',
  CONFIRMED:        'Confirmado',
  PREPARING:        'Preparando',
  READY:            'Pronto',
  OUT_FOR_DELIVERY: 'Saiu p/ entrega',
  DELIVERED:        'Entregue',
  CANCELLED:        'Cancelado',
  REFUNDED:         'Estornado',
}

const PGTO_PT: Record<string, string> = {
  PENDING: 'Pendente',
  PAID:    'Pago',
  FAILED:  'Falhou',
  REFUNDED:'Estornado',
}

const TYPE_PT: Record<string, string> = {
  DELIVERY: 'Delivery',
  TABLE:    'Mesa',
  PICKUP:   'Retirada',
  PDV:      'Balcão',
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // VULN-ALTA-05 CORRIGIDO: o menu lateral esconde "Relatórios" pra quem
  // não é TENANT_ADMIN/MANAGER, mas essa rota checava só a sessão — sem
  // essa checagem, ATTENDANT/STAFF/DELIVERY_PERSON conseguiam chamar a
  // API diretamente e exportar faturamento + dados de clientes.
  if (!hasPermission(session.user.role as UserRole, 'reports:export')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const format = (searchParams.get('format') ?? 'xlsx') as 'xlsx' | 'pdf'
  const type   = searchParams.get('type') ?? 'orders'

  // VULN-NEW-02 CORRIGIDO: validar datas com Zod antes de qualquer uso
  const startParsed = dateParamSchema.safeParse(searchParams.get('start'))
  const endParsed   = dateParamSchema.safeParse(searchParams.get('end'))

  if (!startParsed.success) {
    return NextResponse.json({ error: `Parâmetro 'start' inválido: ${startParsed.error.errors[0].message}` }, { status: 400 })
  }
  if (!endParsed.success) {
    return NextResponse.json({ error: `Parâmetro 'end' inválido: ${endParsed.error.errors[0].message}` }, { status: 400 })
  }

  const startDate = startParsed.data ?? null
  const endDate   = endParsed.data   ?? null
  const tenantId  = session.user.tenantId

  // Filtros normais + avançados — mesmos usados na tela de relatórios
  const filterPdv      = searchParams.get('pdv')      ?? ''
  const filterPayment  = searchParams.get('payment')  ?? ''
  const filterProduct  = searchParams.get('product')  ?? ''
  const filterSaleType = searchParams.get('saleType') ?? ''
  const filterUser     = searchParams.get('user')     ?? ''

  // Converter datas para fuso de São Paulo (UTC-3)
  // "2026-06-27" no fuso SP = "2026-06-27T03:00:00Z" (início) e "2026-06-28T02:59:59Z" (fim)
  const toSpStart = (d: string) => new Date(d + 'T00:00:00-03:00')
  const toSpEnd   = (d: string) => new Date(d + 'T23:59:59-03:00')

  const dateFilter = {
    ...(startDate ? { gte: toSpStart(startDate) } : {}),
    ...(endDate   ? { lte: toSpEnd(endDate) }     : {}),
  }

  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } })
  const tenantName = tenant?.name ?? 'Estabelecimento'

  // CORREÇÃO: qualquer erro inesperado durante a geração do relatório agora
  // retorna uma resposta JSON com detalhes (em dev) em vez de deixar a exceção
  // "vazar" como HTML de erro — que o frontend interpreta apenas como
  // "Erro ao exportar" sem nenhuma pista do que aconteceu.
  try {

  // ─────────────────────────────────────────────────────────────────────────
  // XLSX
  // ─────────────────────────────────────────────────────────────────────────
  if (format === 'xlsx') {
    let rows: string[][] = []
    let headers: string[] = []
    let sheetName = 'Relatório'
    let filename = 'relatorio.xlsx'

    if (type === 'orders') {
      filename  = `pedidos-${todayStr()}.xlsx`
      sheetName = 'Pedidos'
      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          ...(hasKeys(dateFilter) ? { createdAt: dateFilter } : {}),
          ...buildOrderExtraFilters({ filterPdv, filterSaleType, filterPayment, filterProduct, filterUser }),
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
        select: {
          orderNumber: true, status: true, paymentStatus: true,
          type: true, total: true, subtotal: true, deliveryFee: true,
          discountAmount: true, createdAt: true, deliveryBairro: true,
          customer: { select: { name: true, phone: true } },
          waiter:   { select: { name: true } },
          pdv:      { select: { name: true } },
          payments: { select: { method: true, amount: true } },
        },
      })
      headers = ['Número','Data','Status','Pgto','Tipo','Cliente','Telefone','Bairro','Garçom','PDV','Subtotal','Entrega','Desconto','Total','Formas de Pgto']
      rows = orders.map((o) => [
        formatOrderNumber(o.orderNumber),
        formatDate(o.createdAt),
        STATUS_PT[o.status]        ?? o.status,
        PGTO_PT[o.paymentStatus]   ?? o.paymentStatus,
        TYPE_PT[o.type]            ?? o.type,
        o.customer?.name ?? '',
        o.customer?.phone ?? '',
        o.deliveryBairro ?? '',
        o.waiter?.name ?? '',
        o.pdv?.name ?? '',
        fmtN(o.subtotal),
        fmtN(o.deliveryFee),
        fmtN(o.discountAmount),
        fmtN(o.total),
        o.payments.map((p) => `${METHOD_PT[p.method] ?? p.method}: R$${Number(p.amount).toFixed(2)}`).join(' | '),
      ])
    }

    else if (type === 'revenue') {
      filename  = `faturamento-${todayStr()}.xlsx`
      sheetName = 'Faturamento'

      const revenueOrders = await prisma.order.findMany({
        where: {
          tenantId,
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
          ...(hasKeys(dateFilter) ? { createdAt: dateFilter } : {}),
          ...buildOrderExtraFilters({ filterPdv, filterSaleType, filterPayment, filterProduct, filterUser }),
        },
        select: { total: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })

      // Agrupar por dia no fuso de São Paulo
      const byDay = new Map<string, { revenue: number; orders: number }>()
      for (const o of revenueOrders) {
        const day = new Date(o.createdAt).toLocaleDateString('pt-BR', {
          timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        }).split('/').reverse().join('-')
        const cur = byDay.get(day) ?? { revenue: 0, orders: 0 }
        cur.revenue += Number(o.total)
        cur.orders  += 1
        byDay.set(day, cur)
      }

      headers = ['Data','Faturamento (R$)','Pedidos','Ticket Médio (R$)']
      rows = Array.from(byDay.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, d]) => [date, d.revenue.toFixed(2), String(d.orders), (d.revenue / d.orders).toFixed(2)])
    }

    else if (type === 'products') {
      filename  = `produtos-${todayStr()}.xlsx`
      sheetName = 'Produtos'
      const items = await prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: {
          order: {
            tenantId, status: { notIn: ['CANCELLED', 'REFUNDED'] },
            ...(hasKeys(dateFilter) ? { createdAt: dateFilter } : {}),
            ...buildOrderExtraFiltersForItems({ filterPdv, filterSaleType, filterPayment, filterUser }),
          },
          ...(filterProduct ? { productId: filterProduct } : {}),
        },
        _sum:   { quantity: true, totalPrice: true },
        _count: { id: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 200,
      })
      headers = ['Produto','Qtd Vendida','Receita Total (R$)','Nº Pedidos']
      rows = items.map((i) => [
        i.productName,
        String(i._sum.quantity ?? 0),
        Number(i._sum.totalPrice ?? 0).toFixed(2),
        String(i._count.id),
      ])
    }

    const xlsxBuffer = buildXlsx({ sheetName, headers, rows, tenantName, startDate, endDate })
    // CORREÇÃO: converter Buffer para Uint8Array para satisfazer o tipo BodyInit
    return new Response(new Uint8Array(xlsxBuffer), {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PDF (HTML → print)
  // ─────────────────────────────────────────────────────────────────────────
  if (format === 'pdf') {
    if (type === 'orders') {
      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          ...(hasKeys(dateFilter) ? { createdAt: dateFilter } : {}),
          ...buildOrderExtraFilters({ filterPdv, filterSaleType, filterPayment, filterProduct, filterUser }),
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: {
          orderNumber: true, status: true, paymentStatus: true, type: true,
          total: true, createdAt: true,
          customer: { select: { name: true, phone: true } },
          payments: { select: { method: true, amount: true } },
        },
      })
      // CORREÇÃO: pedidos pagos em dinheiro/cartão ficam paymentStatus=PENDING até
  // confirmação manual; considerar faturamento = pedidos não cancelados/reembolsados.
  const totalRevenue = orders
    .filter(o => !['CANCELLED', 'REFUNDED'].includes(o.status))
    .reduce((s, o) => s + Number(o.total), 0)
      const html = buildOrdersPdf({ tenantName, orders, totalRevenue, startDate, endDate })
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    if (type === 'revenue') {
      const revenueOrdersPdf = await prisma.order.findMany({
        where: {
          tenantId,
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
          ...(hasKeys(dateFilter) ? { createdAt: dateFilter } : {}),
          ...buildOrderExtraFilters({ filterPdv, filterSaleType, filterPayment, filterProduct, filterUser }),
        },
        select: { total: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })

      const byDayPdf = new Map<string, { revenue: number; orders: number }>()
      for (const o of revenueOrdersPdf) {
        const day = new Date(o.createdAt).toLocaleDateString('pt-BR', {
          timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        }).split('/').reverse().join('-')
        const cur = byDayPdf.get(day) ?? { revenue: 0, orders: 0 }
        cur.revenue += Number(o.total)
        cur.orders  += 1
        byDayPdf.set(day, cur)
      }

      const data = Array.from(byDayPdf.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, d]) => ({ date, revenue: d.revenue, orders: d.orders, avg_ticket: d.revenue / d.orders }))

      const html = buildRevenuePdf({ tenantName, data, startDate, endDate })
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    if (type === 'products') {
      const items = await prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: {
          order: {
            tenantId, status: { notIn: ['CANCELLED', 'REFUNDED'] },
            ...(hasKeys(dateFilter) ? { createdAt: dateFilter } : {}),
            ...buildOrderExtraFiltersForItems({ filterPdv, filterSaleType, filterPayment, filterUser }),
          },
          ...(filterProduct ? { productId: filterProduct } : {}),
        },
        _sum: { quantity: true, totalPrice: true },
        _count: { id: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 100,
      })
      const html = buildProductsPdf({ tenantName, items, startDate, endDate })
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
  }

  return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
  } catch (err: any) {
    console.error('[reports/export] Erro ao gerar relatório:', err)
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === 'development'
            ? `Erro ao gerar relatório: ${err?.message ?? 'erro desconhecido'}`
            : 'Erro ao gerar relatório. Tente novamente em alguns instantes.',
      },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10)
const fmtN     = (v: any) => Number(v ?? 0).toFixed(2)
const hasKeys  = (o: object) => Object.keys(o).length > 0

// Constrói os campos extras de filtro (PDV, tipo de venda, pagamento, produto,
// usuário) a serem espalhados junto ao `where` de um Order — espelha a mesma
// lógica usada em app/(dashboard)/dashboard/reports/page.tsx para garantir
// que a exportação reflita exatamente os filtros aplicados na tela.
function buildOrderExtraFilters(opts: {
  filterPdv: string; filterSaleType: string
  filterPayment: string; filterProduct: string; filterUser: string
}): any {
  const { filterPdv, filterSaleType, filterPayment, filterProduct, filterUser } = opts
  const extra: any = {}
  if (filterPdv === 'null') extra.pdvId = null
  else if (filterPdv)       extra.pdvId = filterPdv
  if (filterSaleType) extra.type = filterSaleType
  if (filterPayment)  extra.payments = { some: { method: filterPayment } }
  if (filterProduct)  extra.items    = { some: { productId: filterProduct } }
  if (filterUser) {
    extra.statusHistory = {
      some: { userId: filterUser, notes: { contains: 'Pagamento confirmado' } },
    }
  }
  return extra
}

// Mesma coisa, mas sem o filtro de produto — usado dentro de `order: {...}`
// no relatório de Produtos (orderItem.groupBy), onde o filtro de produto é
// aplicado diretamente no nível do item, não como "algum item contém X".
function buildOrderExtraFiltersForItems(opts: {
  filterPdv: string; filterSaleType: string
  filterPayment: string; filterUser: string
}): any {
  const { filterPdv, filterSaleType, filterPayment, filterUser } = opts
  return buildOrderExtraFilters({ filterPdv, filterSaleType, filterPayment, filterProduct: '', filterUser })
}

const periodLabel = (s: string | null, e: string | null) =>
  s && e ? `${new Date(s).toLocaleDateString('pt-BR')} a ${new Date(e).toLocaleDateString('pt-BR')}` : 'Todo o período'

// ─────────────────────────────────────────────────────────────────────────────
// XLSX builder — OOXML nativo (sem dependências)
// Gera um .xlsx simples sem biblioteca externa usando OOXML comprimido em ZIP
// ─────────────────────────────────────────────────────────────────────────────
function buildXlsx({ sheetName, headers, rows, tenantName, startDate, endDate }: {
  sheetName: string; headers: string[]; rows: string[][]
  tenantName: string; startDate: string | null; endDate: string | null
}): Buffer {
  // Encode XML cell value safely
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const isNum = (s: string) => s !== '' && !isNaN(Number(s.replace(',', '.')))

  // Build shared strings: collect all strings for the sst (SharedStringTable)
  const sst: string[] = []
  const sstMap = new Map<string, number>()
  const si = (v: string) => {
    if (!sstMap.has(v)) { sstMap.set(v, sst.length); sst.push(v) }
    return sstMap.get(v)!
  }

  // Title row + period row
  const titleIdx  = si(`${tenantName} — ${sheetName}`)
  const periodIdx = si(`Período: ${periodLabel(startDate, endDate)}`)
  const headerIdxs = headers.map(si)

  // All row string cells
  const rowIdxs = rows.map((r) => r.map((cell) => isNum(cell) ? null : si(cell)))

  // Column letter helper
  const colLetter = (i: number) => String.fromCharCode(65 + i)

  // Build worksheet XML
  let sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>`

  // Row 1: title
  sheetXml += `<row r="1"><c r="A1" t="s"><v>${titleIdx}</v></c></row>`
  // Row 2: period
  sheetXml += `<row r="2"><c r="A2" t="s"><v>${periodIdx}</v></c></row>`
  // Row 3: blank
  sheetXml += `<row r="3"/>`
  // Row 4: headers
  sheetXml += `<row r="4">`
  headers.forEach((_, i) => {
    sheetXml += `<c r="${colLetter(i)}4" t="s" s="1"><v>${headerIdxs[i]}</v></c>`
  })
  sheetXml += `</row>`

  // Data rows from row 5
  rows.forEach((row, ri) => {
    const rowNum = ri + 5
    sheetXml += `<row r="${rowNum}">`
    row.forEach((cell, ci) => {
      const col = colLetter(ci)
      if (isNum(cell)) {
        sheetXml += `<c r="${col}${rowNum}"><v>${cell}</v></c>`
      } else {
        sheetXml += `<c r="${col}${rowNum}" t="s"><v>${rowIdxs[ri][ci]}</v></c>`
      }
    })
    sheetXml += `</row>`
  })

  sheetXml += `</sheetData></worksheet>`

  // Shared strings XML
  const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">
${sst.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}
</sst>`

  // Styles XML (bold for headers = style index 1)
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts><font><sz val="11"/></font><font><b/><sz val="11"/></font></fonts>
  <fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
</styleSheet>`

  // Workbook XML
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

  // Relationships
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings"
    Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
    Target="styles.xml"/>
</Relationships>`

  const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="xl/workbook.xml"/>
</Relationships>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

  // Build ZIP manually (PKZIP local file + central directory)
  const files: Array<{ name: string; data: Buffer }> = [
    { name: '[Content_Types].xml',       data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels',               data: Buffer.from(pkgRels, 'utf8') },
    { name: 'xl/workbook.xml',           data: Buffer.from(workbookXml, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels',data: Buffer.from(wbRels, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml',  data: Buffer.from(sheetXml, 'utf8') },
    { name: 'xl/sharedStrings.xml',      data: Buffer.from(sstXml, 'utf8') },
    { name: 'xl/styles.xml',             data: Buffer.from(stylesXml, 'utf8') },
  ]

  return buildZip(files)
}

// Minimal ZIP builder (stored, no compression — OOXML parsers accept stored)
function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const localHeaders: Buffer[] = []
  const centralDirs: Buffer[]  = []
  const offsets: number[]      = []
  let offset = 0

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8')
    const crc       = crc32(file.data)
    const size      = file.data.length

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length + size)
    local.writeUInt32LE(0x04034b50, 0)   // signature
    local.writeUInt16LE(20, 4)           // version needed
    local.writeUInt16LE(0, 6)            // flags
    local.writeUInt16LE(0, 8)            // compression: stored
    local.writeUInt16LE(0, 10)           // mod time
    local.writeUInt16LE(0, 12)           // mod date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    nameBytes.copy(local, 30)
    file.data.copy(local, 30 + nameBytes.length)

    offsets.push(offset)
    localHeaders.push(local)
    offset += local.length

    // Central directory entry
    const cd = Buffer.alloc(46 + nameBytes.length)
    cd.writeUInt32LE(0x02014b50, 0)   // signature
    cd.writeUInt16LE(20, 4)           // version made by
    cd.writeUInt16LE(20, 6)           // version needed
    cd.writeUInt16LE(0, 8)            // flags
    cd.writeUInt16LE(0, 10)           // compression
    cd.writeUInt16LE(0, 12)           // mod time
    cd.writeUInt16LE(0, 14)           // mod date
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(size, 20)
    cd.writeUInt32LE(size, 24)
    cd.writeUInt16LE(nameBytes.length, 28)
    cd.writeUInt16LE(0, 30)           // extra field length
    cd.writeUInt16LE(0, 32)           // comment length
    cd.writeUInt16LE(0, 34)           // disk number start
    cd.writeUInt16LE(0, 36)           // internal attributes
    cd.writeUInt32LE(0, 38)           // external attributes
    cd.writeUInt32LE(offsets[offsets.length - 1], 42)
    nameBytes.copy(cd, 46)
    centralDirs.push(cd)
  }

  const cdSize   = centralDirs.reduce((s, b) => s + b.length, 0)
  const eocd     = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localHeaders, ...centralDirs, eocd])
}

// CRC-32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF HTML builders
//
// VULN-ALTA-06 CORRIGIDO: essas funções montam HTML por concatenação de
// string e o retornam com Content-Type: text/html — qualquer valor vindo
// do banco (nome de cliente, nome de produto, nome do tenant) que não
// passe por escapeHtml() aqui vira XSS armazenado contra quem abrir o
// relatório exportado. sanitizeText() já impede a entrada de '<'/'>' em
// customerName na criação do pedido (ver actions/orders/create-order.ts),
// mas escapamos de novo aqui — defesa em profundidade, inclusive para
// dados que já existiam no banco antes dessa correção.
// ─────────────────────────────────────────────────────────────────────────────
const pdfBase = (title: string, tenantName: string, period: string, content: string) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)} — ${escapeHtml(tenantName)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box }
body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 32px }
h1 { font-size: 20px; margin-bottom: 4px; color: #f97316 }
.meta { color: #666; margin-bottom: 20px; font-size: 11px }
.summary { background: #f9f9f9; border-radius: 8px; padding: 16px; margin-bottom: 20px; display: flex; gap: 32px; flex-wrap: wrap }
.stat-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .05em }
.stat-value { font-size: 18px; font-weight: bold }
table { width: 100%; border-collapse: collapse; margin-top: 8px }
th { background: #f3f4f6; padding: 7px 8px; text-align: left; font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: .04em }
td { padding: 7px 8px; border-bottom: 1px solid #f0f0f0; font-size: 11px }
tr:nth-child(even) td { background: #fafafa }
@media print { body { padding: 0 } button { display: none } }
</style>
</head>
<body>
<h1>${escapeHtml(tenantName)}</h1>
<p class="meta">${escapeHtml(title)} • ${escapeHtml(period)} • Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
${content}
<script>window.onload = () => setTimeout(() => window.print(), 400)</script>
</body>
</html>`

function buildOrdersPdf({ tenantName, orders, totalRevenue, startDate, endDate }: {
  tenantName: string; orders: any[]; totalRevenue: number
  startDate: string | null; endDate: string | null
}) {
  const period = periodLabel(startDate, endDate)
  const paid   = orders.filter((o) => !['CANCELLED', 'REFUNDED'].includes(o.status)).length
  const avg    = paid > 0 ? totalRevenue / paid : 0

  const summary = `<div class="summary">
    <div><div class="stat-label">Total pedidos</div><div class="stat-value">${orders.length}</div></div>
    <div><div class="stat-label">Faturamento</div><div class="stat-value">${formatCurrency(totalRevenue)}</div></div>
    <div><div class="stat-label">Ticket médio</div><div class="stat-value">${formatCurrency(avg)}</div></div>
    <div><div class="stat-label">Pagos</div><div class="stat-value">${paid}</div></div>
  </div>`

  const rows = orders.map((o) => `<tr>
    <td>${formatOrderNumber(o.orderNumber)}</td>
    <td>${formatDate(o.createdAt)}</td>
    <td>${escapeHtml(o.customer?.name) || '—'}</td>
    <td>${TYPE_PT[o.type]          ?? o.type}</td>
    <td>${STATUS_PT[o.status]      ?? o.status}</td>
    <td>${PGTO_PT[o.paymentStatus] ?? o.paymentStatus}</td>
    <td>${o.payments?.map((p: any) => METHOD_PT[p.method] ?? p.method).join(', ') ?? '—'}</td>
    <td style="text-align:right;font-weight:bold">${formatCurrency(Number(o.total))}</td>
  </tr>`).join('')

  const table = `<table>
    <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Pgto</th><th>Método</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`

  return pdfBase('Relatório de Pedidos', tenantName, period, summary + table)
}

function buildRevenuePdf({ tenantName, data, startDate, endDate }: {
  tenantName: string
  data: Array<{ date: string; revenue: number; orders: number; avg_ticket: number }>
  startDate: string | null; endDate: string | null
}) {
  const period = periodLabel(startDate, endDate)
  const total  = data.reduce((s, d) => s + d.revenue, 0)
  const orders = data.reduce((s, d) => s + d.orders, 0)

  const summary = `<div class="summary">
    <div><div class="stat-label">Faturamento total</div><div class="stat-value">${formatCurrency(total)}</div></div>
    <div><div class="stat-label">Total de dias</div><div class="stat-value">${data.length}</div></div>
    <div><div class="stat-label">Total de pedidos</div><div class="stat-value">${orders}</div></div>
  </div>`

  const rows = data.map((d) => `<tr>
    <td>${new Date(d.date).toLocaleDateString('pt-BR')}</td>
    <td style="text-align:right;font-weight:bold">${formatCurrency(d.revenue)}</td>
    <td style="text-align:center">${d.orders}</td>
    <td style="text-align:right">${formatCurrency(d.avg_ticket)}</td>
  </tr>`).join('')

  const table = `<table>
    <thead><tr><th>Data</th><th>Faturamento</th><th style="text-align:center">Pedidos</th><th>Ticket Médio</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`

  return pdfBase('Relatório de Faturamento', tenantName, period, summary + table)
}

function buildProductsPdf({ tenantName, items, startDate, endDate }: {
  tenantName: string; items: any[]; startDate: string | null; endDate: string | null
}) {
  const period   = periodLabel(startDate, endDate)
  const totalRev = items.reduce((s, i) => s + Number(i._sum.totalPrice ?? 0), 0)
  const totalQty = items.reduce((s, i) => s + (i._sum.quantity ?? 0), 0)

  const summary = `<div class="summary">
    <div><div class="stat-label">Produtos únicos</div><div class="stat-value">${items.length}</div></div>
    <div><div class="stat-label">Unidades vendidas</div><div class="stat-value">${totalQty}</div></div>
    <div><div class="stat-label">Receita total</div><div class="stat-value">${formatCurrency(totalRev)}</div></div>
  </div>`

  const rows = items.map((item, i) => `<tr>
    <td style="text-align:center;font-weight:bold;color:#f97316">${i + 1}</td>
    <td>${escapeHtml(item.productName)}</td>
    <td style="text-align:center;font-weight:bold">${item._sum.quantity ?? 0}</td>
    <td style="text-align:right;font-weight:bold">${formatCurrency(Number(item._sum.totalPrice ?? 0))}</td>
    <td style="text-align:center">${item._count.id}</td>
  </tr>`).join('')

  const table = `<table>
    <thead><tr><th>#</th><th>Produto</th><th style="text-align:center">Qtd</th><th>Receita</th><th style="text-align:center">Pedidos</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`

  return pdfBase('Relatório de Produtos', tenantName, period, summary + table)
}
