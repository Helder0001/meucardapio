// lib/utils/print.ts
//
// Gera o conteúdo formatado para impressoras térmicas.
// Usa texto simples com caracteres especiais compatíveis com ESC/POS.
// Compatível com impressoras Epson, Bematech, Elgin, etc.

import { prisma } from '@/lib/db/client'
import { formatCurrency, formatOrderNumber } from './format'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export async function generateOrderPrintContent(orderId: string): Promise<string> {
  const order = await prisma.order.findFirst({
    where: { id: orderId },
    include: {
      tenant: { select: { name: true, phone: true } },
      customer: { select: { name: true, phone: true } },
      table: { select: { number: true, sector: true } },
      items: {
        include: {
          addons: { select: { addonName: true, addonPrice: true } },
        },
      },
    },
  })

  if (!order) return ''

  const line = (char = '-', len = 42) => char.repeat(len)
  const center = (text: string, len = 42) => {
    const spaces = Math.max(0, Math.floor((len - text.length) / 2))
    return ' '.repeat(spaces) + text
  }
  const row = (left: string, right: string, len = 42) => {
    const gap = Math.max(1, len - left.length - right.length)
    return left + ' '.repeat(gap) + right
  }

  const lines: string[] = []
  const now = new Date()

  // Cabeçalho
  lines.push(center(order.tenant.name.toUpperCase()))
  if (order.tenant.phone) lines.push(center(order.tenant.phone))
  lines.push(line())

  // Info do pedido
  lines.push(center(`PEDIDO ${formatOrderNumber(order.orderNumber)}`))
  lines.push(center(format(now, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })))
  lines.push('')

  const typeLabel: Record<string, string> = {
    DELIVERY: 'DELIVERY',
    TABLE:    `MESA ${order.table?.number ?? ''} - ${order.table?.sector ?? ''}`,
    PICKUP:   'RETIRADA NO LOCAL',
    PDV:      'BALCÃO',
  }
  lines.push(center(`** ${typeLabel[order.type] ?? order.type} **`))
  lines.push(line())

  // Cliente
  if (order.customer) {
    lines.push(`Cliente: ${order.customer.name ?? order.customer.phone}`)
    if (order.type === 'DELIVERY' && order.deliveryBairro) {
      lines.push(`Bairro: ${order.deliveryBairro}`)
    }
    lines.push('')
  }

  // Itens
  lines.push('ITENS DO PEDIDO')
  lines.push(line('-'))

  for (const item of order.items) {
    lines.push(row(
      `${item.quantity}x ${item.productName}`,
      formatCurrency(Number(item.totalPrice))
    ))
    for (const addon of item.addons) {
      if (Number(addon.addonPrice) > 0) {
        lines.push(row(`  + ${addon.addonName}`, formatCurrency(Number(addon.addonPrice))))
      } else {
        lines.push(`  + ${addon.addonName}`)
      }
    }
    if (item.notes) {
      lines.push(`  OBS: ${item.notes}`)
    }
  }

  lines.push(line())

  // Totais
  lines.push(row('Subtotal:', formatCurrency(Number(order.subtotal))))
  if (Number(order.deliveryFee) > 0) {
    lines.push(row('Entrega:', formatCurrency(Number(order.deliveryFee))))
  }
  if (Number(order.discountAmount) > 0) {
    lines.push(row('Desconto:', `-${formatCurrency(Number(order.discountAmount))}`))
  }
  lines.push(line())
  lines.push(row('TOTAL:', formatCurrency(Number(order.total))))
  lines.push(line())

  // Pagamento
  const paymentLabel: Record<string, string> = {
    PIX:                'PIX',
    CASH:               `DINHEIRO${order.changeFor ? ` (troco p/ ${formatCurrency(Number(order.changeFor))})` : ''}`,
    CREDIT_CARD:        'CARTÃO CRÉDITO',
    CREDIT_CARD_MANUAL: 'CARTÃO CRÉDITO (ENTREGA)',
    DEBIT_CARD:         'CARTÃO DÉBITO',
  }

  // Rodapé
  lines.push('')
  lines.push(center('Obrigado pela preferencia!'))
  lines.push(center('Bom apetite!'))
  lines.push('')
  lines.push('')

  return lines.join('\n')
}

// Enfileirar impressão em todas as impressoras do setor
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

  const content = await generateOrderPrintContent(orderId)

  await prisma.printJob.createMany({
    data: printers.map((printer) => ({
      printerId: printer.id,
      orderId,
      content,
      status: 'PENDING',
    })),
  })
}
