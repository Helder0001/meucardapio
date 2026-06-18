// app/api/reports/export/route.ts
// Exportação em XLSX (real) e PDF (HTML para print)
//
// VULN-NEW-02 CORRIGIDO: validação de formato de datas com Zod antes de qualquer uso.
// VULN-NEW-01 CORRIGIDO: $queryRaw usa Prisma.sql para parametrizar datas,
//   eliminando a interpolação direta de strings não confiáveis em SQL.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { formatCurrency, formatDate, formatOrderNumber } from '@/lib/utils/format'

// Validação estrita de formato de data (YYYY-MM-DD).
// Impede que strings arbitrárias cheguem ao banco via $queryRaw ou new Date().
const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido — use YYYY-MM-DD')
  .nullable()
  .optional()

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const dateFilter = {
    ...(startDate ? { gte: new Date(startDate) } : {}),
    ...(endDate   ? { lte: new Date(endDate + 'T23:59:59') } : {}),
  }

  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true } })
  const tenantName = tenant?.name ?? 'Estabelecimento'

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
        where: { tenantId, ...(hasKeys(dateFilter) ? { createdAt: dateFilter } : {}) },
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
        o.status,
        o.paymentStatus,
        o.type,
        o.customer?.name ?? '',
        o.customer?.phone ?? '',
        o.deliveryBairro ?? '',
        o.waiter?.name ?? '',
        o.pdv?.name ?? '',
        fmtN(o.subtotal),
        fmtN(o.deliveryFee),
        fmtN(o.discountAmount),
        fmtN(o.total),
        o.payments.map((p) => `${p.method}:R$${Number(p.amount).toFixed(2)}`).join(' | '),
      ])
    }

    else if (type === 'revenue') {
      filename  = `faturamento-${todayStr()}.xlsx`
      sheetName = 'Faturamento'
      // VULN-NEW-01 CORRIGIDO: datas parametrizadas com Prisma.sql, nunca interpoladas como string
      const startFilter = startDate
        ? Prisma.sql`AND created_at >= ${new Date(startDate)}::timestamptz`
        : Prisma.empty
      const endFilter = endDate
        ? Prisma.sql`AND created_at <= ${new Date(endDate + 'T23:59:59')}::timestamptz`
        : Prisma.empty

      const data = await prisma.$queryRaw<Array<{
        date: string; revenue: number; orders: number; avg_ticket: number
      }>>(Prisma.sql`
        SELECT
          DATE(created_at AT TIME ZONE 'America/Sao_Paulo')::text as date,
          COALESCE(SUM(total), 0)::float   as revenue,
          COUNT(*)::int                    as orders,
          COALESCE(AVG(total), 0)::float   as avg_ticket
        FROM "Order"
        WHERE tenant_id = ${tenantId}
          AND payment_status = 'PAID'
          ${startFilter}
          ${endFilter}
        GROUP BY DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY date DESC
      `)
      headers = ['Data','Faturamento (R$)','Pedidos','Ticket Médio (R$)']
      rows = data.map((d) => [d.date, d.revenue.toFixed(2), String(d.orders), d.avg_ticket.toFixed(2)])
    }

    else if (type === 'products') {
      filename  = `produtos-${todayStr()}.xlsx`
      sheetName = 'Produtos'
      const items = await prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: {
          order: { tenantId, paymentStatus: 'PAID', ...(hasKeys(dateFilter) ? { createdAt: dateFilter } : {}) },
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
        where: { tenantId, ...(hasKeys(dateFilter) ? { createdAt: dateFilter } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: {
          orderNumber: true, status: true, paymentStatus: true, type: true,
          total: true, createdAt: true,
          customer: { select: { name: true, phone: true } },
          payments: { select: { method: true, amount: true } },
        },
      })
      const totalRevenue = orders.filter(o => o.paymentStatus === 'PAID').reduce((s, o) => s + Number(o.total), 0)
      const html = buildOrdersPdf({ tenantName, orders, totalRevenue, startDate, endDate })
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    if (type === 'revenue') {
      // VULN-NEW-01 CORRIGIDO: reutiliza os filtros parametrizados já construídos acima
      const startFilterPdf = startDate
        ? Prisma.sql`AND created_at >= ${new Date(startDate)}::timestamptz`
        : Prisma.empty
      const endFilterPdf = endDate
        ? Prisma.sql`AND created_at <= ${new Date(endDate + 'T23:59:59')}::timestamptz`
        : Prisma.empty

      const data = await prisma.$queryRaw<Array<{
        date: string; revenue: number; orders: number; avg_ticket: number
      }>>(Prisma.sql`
        SELECT
          DATE(created_at AT TIME ZONE 'America/Sao_Paulo')::text as date,
          COALESCE(SUM(total), 0)::float   as revenue,
          COUNT(*)::int                    as orders,
          COALESCE(AVG(total), 0)::float   as avg_ticket
        FROM "Order"
        WHERE tenant_id = ${tenantId}
          AND payment_status = 'PAID'
          ${startFilterPdf}
          ${endFilterPdf}
        GROUP BY DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY date DESC
      `)
      const html = buildRevenuePdf({ tenantName, data, startDate, endDate })
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    if (type === 'products') {
      const items = await prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: { order: { tenantId, paymentStatus: 'PAID', ...(hasKeys(dateFilter) ? { createdAt: dateFilter } : {}) } },
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10)
const fmtN     = (v: any) => Number(v ?? 0).toFixed(2)
const hasKeys  = (o: object) => Object.keys(o).length > 0

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
// ─────────────────────────────────────────────────────────────────────────────
const pdfBase = (title: string, tenantName: string, period: string, content: string) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${title} — ${tenantName}</title>
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
<h1>${tenantName}</h1>
<p class="meta">${title} • ${period} • Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
${content}
<script>window.onload = () => setTimeout(() => window.print(), 400)</script>
</body>
</html>`

function buildOrdersPdf({ tenantName, orders, totalRevenue, startDate, endDate }: {
  tenantName: string; orders: any[]; totalRevenue: number
  startDate: string | null; endDate: string | null
}) {
  const period = periodLabel(startDate, endDate)
  const paid   = orders.filter((o) => o.paymentStatus === 'PAID').length
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
    <td>${o.customer?.name ?? '—'}</td>
    <td>${o.type}</td>
    <td>${o.status}</td>
    <td>${o.paymentStatus}</td>
    <td>${o.payments?.map((p: any) => p.method).join(', ') ?? '—'}</td>
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
    <td>${item.productName}</td>
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
