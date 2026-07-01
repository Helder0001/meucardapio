// lib/utils/print.ts
//
// Gera o conteúdo formatado para impressoras térmicas de 80mm (42/48 colunas
// físicas, aqui usamos 40 colunas de texto — mesma largura de sistemas
// consolidados do mercado). Texto simples, compatível com ESC/POS
// (Epson, Bematech, Elgin, etc — sem emoji, sem acentuação problemática).
//
// Dois modelos:
//   - generateOrderPrintContent()   → cupom completo (balcão/cliente):
//     cabeçalho com nome/telefone do estabelecimento, itens com valores,
//     totais, forma de pagamento, dados do cliente e observações.
//   - generateKitchenPrintContent() → cupom simplificado (cozinha/bar):
//     só os itens e observações, sem preço — pensado pra ser lido rápido
//     no calor da produção.
//
// queuePrintJob() decide automaticamente qual dos dois usar de acordo com
// o setor da impressora (sector: 'KITCHEN' | 'BAR' | 'COUNTER').

import { prisma } from '@/lib/db/client'
import { formatCurrency, formatOrderNumber, formatPhone } from './format'
import { formatInTimeZone } from 'date-fns-tz'
import { ptBR } from 'date-fns/locale'

const APP_TIMEZONE = 'America/Sao_Paulo'
const WIDTH = 40

// ── Helpers de formatação de texto para impressora térmica ──────────────────

const divider  = (char = '-') => char.repeat(WIDTH)

const center = (text: string) => {
  const spaces = Math.max(0, Math.floor((WIDTH - text.length) / 2))
  return ' '.repeat(spaces) + text
}

// Alinha um valor (ex.: preço) à direita, com o rótulo à esquerda.
// Se não couber na largura da linha, quebra o valor pra linha de baixo
// em vez de sobrepor o texto.
const row = (left: string, right: string) => {
  if (left.length + right.length + 1 > WIDTH) {
    return `${left}\n${' '.repeat(Math.max(0, WIDTH - right.length))}${right}`
  }
  const gap = WIDTH - left.length - right.length
  return left + ' '.repeat(gap) + right
}

const bullet = (text: string) => `• ${text}`

// Quebra um texto livre (observações) em uma lista de bullets — uma por
// linha digitada pelo lojista/cliente.
const toBullets = (text: string): string[] =>
  text.split('\n').map((l) => l.trim()).filter(Boolean).map(bullet)

function formatDateTimePrint(date: Date): string {
  return formatInTimeZone(date, APP_TIMEZONE, 'dd/MM/yyyy HH:mm', { locale: ptBR })
}
function formatTimePrint(date: Date): string {
  return formatInTimeZone(date, APP_TIMEZONE, 'HH:mm', { locale: ptBR })
}

const STATUS_PRINT_LABELS: Record<string, string> = {
  PENDING:          'NOVO PEDIDO',
  CONFIRMED:        'CONFIRMADO',
  PREPARING:        'EM PREPARO',
  READY:            'PRONTO',
  OUT_FOR_DELIVERY: 'SAIU PARA ENTREGA',
  DELIVERED:        'ENTREGUE',
  CANCELLED:        'CANCELADO',
  REFUNDED:         'REEMBOLSADO',
}

function typePrintLabel(order: { type: string; table: { number: number; sector: string | null } | null }): string {
  switch (order.type) {
    case 'DELIVERY': return 'ENTREGA'
    case 'PICKUP':   return 'RETIRADA'
    case 'PDV':      return 'BALCÃO'
    case 'TABLE':    return `MESA ${order.table?.number ?? ''}${order.table?.sector ? ` - ${order.table.sector}` : ''}`.trim()
    default:         return order.type
  }
}

const PAYMENT_PRINT_LABELS: Record<string, string> = {
  PIX:                'PIX',
  CASH:               'DINHEIRO',
  CREDIT_CARD:        'CARTÃO DE CRÉDITO',
  CREDIT_CARD_MANUAL: 'CARTÃO DE CRÉDITO (ENTREGA/RETIRADA)',
  DEBIT_CARD:         'CARTÃO DE DÉBITO',
  VOUCHER:            'VOUCHER',
  CASHBACK:           'CASHBACK',
}

// Query compartilhada pelos dois modelos de cupom.
async function fetchOrderForPrint(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId },
    include: {
      tenant:   { select: { name: true, phone: true } },
      customer: { select: { name: true, phone: true } },
      table:    { select: { number: true, sector: true } },
      payments: {
        where: { status: { not: 'FAILED' } },
        select: { method: true, amount: true, changeAmount: true },
      },
      items: {
        include: {
          addons: { select: { addonName: true, addonPrice: true } },
        },
      },
    },
  })
}

// ═════════════════════════════════════════════════════════════════════════
// CUPOM COMPLETO — balcão / cliente
// ═════════════════════════════════════════════════════════════════════════
export async function generateOrderPrintContent(orderId: string): Promise<string> {
  const order = await fetchOrderForPrint(orderId)
  if (!order) return ''

  const lines: string[] = []

  // ── Cabeçalho ──────────────────────────────────────────────────────────
  lines.push(divider('='))
  lines.push(center('MEUCARDÁPIO'))
  lines.push(center(order.tenant.name.toUpperCase()))
  if (order.tenant.phone) lines.push(center(formatPhone(order.tenant.phone)))
  lines.push(divider('='))
  lines.push('')

  // ── Info do pedido ──────────────────────────────────────────────────────
  lines.push(center(`PEDIDO ${formatOrderNumber(order.orderNumber)}`))
  lines.push(`Status: ${STATUS_PRINT_LABELS[order.status] ?? order.status}`)
  lines.push(`Data: ${formatDateTimePrint(order.createdAt)}`)
  lines.push(`Tipo: ${typePrintLabel(order)}`)
  lines.push('')

  // ── Itens ────────────────────────────────────────────────────────────────
  lines.push(divider())
  lines.push('ITENS')
  lines.push(divider())
  lines.push('')

  for (const item of order.items) {
    lines.push(row(`${item.quantity}x ${item.productName}`, formatCurrency(Number(item.totalPrice))))
    for (const addon of item.addons) {
      lines.push(Number(addon.addonPrice) > 0
        ? row(`  + ${addon.addonName}`, formatCurrency(Number(addon.addonPrice)))
        : `  + ${addon.addonName}`)
    }
    if (item.notes) lines.push(`  OBS: ${item.notes}`)
  }

  lines.push('')
  lines.push(divider())
  lines.push(row('Subtotal:',        formatCurrency(Number(order.subtotal))))
  lines.push(row('Taxa de entrega:', formatCurrency(Number(order.deliveryFee))))
  lines.push(row('Desconto:',        `-${formatCurrency(Number(order.discountAmount))}`))
  if (Number(order.cashbackUsed) > 0) {
    lines.push(row('Cashback usado:', `-${formatCurrency(Number(order.cashbackUsed))}`))
  }
  lines.push(divider())
  lines.push(row('TOTAL:', formatCurrency(Number(order.total))))
  lines.push(divider())
  lines.push('')

  // ── Pagamento ────────────────────────────────────────────────────────────
  lines.push('Forma de pagamento:')
  if (order.payments.length === 0) {
    lines.push('A combinar')
  } else if (order.payments.length === 1) {
    const p = order.payments[0]
    const change = Number(p.changeAmount ?? order.changeFor ?? 0)
    const label = PAYMENT_PRINT_LABELS[p.method] ?? p.method
    lines.push(p.method === 'CASH' && change > 0 ? `${label} (troco p/ ${formatCurrency(change)})` : label)
  } else {
    for (const p of order.payments) {
      lines.push(row(PAYMENT_PRINT_LABELS[p.method] ?? p.method, formatCurrency(Number(p.amount))))
    }
  }
  lines.push('')

  // ── Cliente ──────────────────────────────────────────────────────────────
  const customerName  = order.customer?.name
  const customerPhone = order.customer?.phone
  if (customerName || customerPhone) {
    if (customerName) {
      lines.push('Cliente:')
      lines.push(customerName)
      lines.push('')
    }
    if (customerPhone) {
      lines.push('Telefone:')
      lines.push(formatPhone(customerPhone))
      lines.push('')
    }
  }

  // ── Endereço (somente delivery) ───────────────────────────────────────────
  if (order.type === 'DELIVERY') {
    const address = (order.deliveryAddress as { address?: string } | null)?.address
    if (address || order.deliveryBairro) {
      lines.push('Endereço:')
      if (address) lines.push(address)
      if (order.deliveryBairro) lines.push(`Bairro: ${order.deliveryBairro}`)
      lines.push('')
    }
  }

  // ── Observações gerais ────────────────────────────────────────────────────
  if (order.notes) {
    lines.push('Observações:')
    lines.push(...toBullets(order.notes))
    lines.push('')
  }

  // ── Rodapé ────────────────────────────────────────────────────────────────
  lines.push(divider('='))
  lines.push(center('Obrigado pela preferência!'))
  lines.push(divider('='))
  lines.push('')
  lines.push('')

  return lines.join('\n')
}

// ═════════════════════════════════════════════════════════════════════════
// CUPOM DA COZINHA/BAR — só o essencial pra produção, sem preço
// ═════════════════════════════════════════════════════════════════════════
export async function generateKitchenPrintContent(orderId: string): Promise<string> {
  const order = await fetchOrderForPrint(orderId)
  if (!order) return ''

  const lines: string[] = []

  lines.push(divider('='))
  lines.push(center(`COZINHA - PEDIDO ${formatOrderNumber(order.orderNumber)}`))
  lines.push(divider('='))
  lines.push('')
  lines.push(center(`${typePrintLabel(order)}  •  ${formatTimePrint(order.createdAt)}`))
  lines.push('')

  for (const item of order.items) {
    lines.push(`${item.quantity}x ${item.productName}`)
    for (const addon of item.addons) lines.push(`  + ${addon.addonName}`)
    if (item.notes) lines.push(`  OBS: ${item.notes}`)
    lines.push('')
  }

  if (order.notes) {
    lines.push('OBS:')
    lines.push(...toBullets(order.notes))
    lines.push('')
  }

  lines.push(divider('='))
  lines.push('')
  lines.push('')

  return lines.join('\n')
}

// Enfileirar impressão em todas as impressoras do setor.
// KITCHEN e BAR recebem o cupom simplificado; qualquer outro setor
// (ex.: COUNTER) recebe o cupom completo.
export async function queuePrintJob(orderId: string, sector = 'KITCHEN') {
  const order = await prisma.order.findFirst({
    where: { id: orderId },
    select: { tenantId: true, pdvId: true },
  })
  if (!order) return

  const printers = await prisma.printer.findMany({
    where: {
      tenantId: order.tenantId,
      sector,
      isActive: true,
      // Impressora do PDV específico OU impressoras sem PDV (cozinha central)
      OR: [
        { pdvId: order.pdvId ?? null },
        { pdvId: null },
      ],
    },
  })

  if (printers.length === 0) return

  const content = sector === 'KITCHEN' || sector === 'BAR'
    ? await generateKitchenPrintContent(orderId)
    : await generateOrderPrintContent(orderId)

  await prisma.printJob.createMany({
    data: printers.map((printer) => ({
      printerId: printer.id,
      orderId,
      content,
      status: 'PENDING',
    })),
  })
}
