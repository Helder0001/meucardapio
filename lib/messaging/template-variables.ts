// lib/messaging/template-variables.ts
//
// Constrói o mapa de variáveis dinâmicas ({nome_cliente}, {link_cardapio}, ...)
// usado tanto pelo robô conversacional (lib/messaging/chatbot-engine.ts)
// quanto pelas mensagens automáticas de status do pedido (lib/messaging/evolution.ts).
// Mantido em um único lugar para não haver duas listas de variáveis divergentes.

import { prisma } from '@/lib/db/client'
import { formatCurrency } from '@/lib/utils/format'

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.meucardapio.com'

const PAYMENT_LABELS: Record<string, string> = {
  PIX:                 'PIX',
  CREDIT_CARD:         'Cartão de Crédito',
  CREDIT_CARD_MANUAL:  'Cartão de Crédito (na entrega/retirada)',
  DEBIT_CARD:          'Cartão de Débito',
  CASH:                'Dinheiro',
  VOUCHER:             'Voucher',
  CASHBACK:            'Cashback',
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  DELIVERY: 'Delivery',
  PICKUP:   'Retirada',
  TABLE:    'Mesa',
  PDV:      'Balcão',
}

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Substitui {chave} pelo valor correspondente. Chaves não encontradas viram string vazia. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in vars ? vars[key] : match
  })
}

interface BuildVarsOptions {
  tenantId: string
  phone?: string
  orderId?: string // se informado, usa esse pedido específico; senão busca o mais recente em andamento
}

/**
 * Monta o mapa completo de variáveis dinâmicas disponíveis nas mensagens
 * (boas-vindas, menu, status de pedido, etc). Busca os dados do tenant e,
 * quando disponível, do pedido/cliente relacionado ao telefone informado.
 */
export async function buildTemplateVariables({ tenantId, phone, orderId }: BuildVarsOptions): Promise<Record<string, string>> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true, slug: true, phone: true,
      businessHours: { orderBy: { dayOfWeek: 'asc' } },
    },
  })

  const vars: Record<string, string> = {
    nome_loja:         tenant?.name ?? '',
    link_cardapio:     tenant ? `${APP_URL}/menu/${tenant.slug}` : '',
    horario_abertura:  '',
    horario_fechamento:'',
    nome_cliente:      '',
    cliente_nome:      '',
    telefone_cliente:  '',
    numero_pedido:     '',
    valor_pedido:      '',
    itens_pedido:      '',
    forma_pagamento:   '',
    status_pagamento:  '',
    metodo_pagamento:  '',
    tipo_pedido:       '',
    horario_pedido:    '',
    endereco_cliente:  '',
    previsao_entrega:  '',
    link_pedido:       '',
    link_rastreio:     '',
  }

  if (tenant?.businessHours?.length) {
    const now = new Date()
    const zoned = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const today = tenant.businessHours.find((h) => h.dayOfWeek === zoned.getDay() && h.isOpen)
      ?? tenant.businessHours.find((h) => h.isOpen)
    if (today) {
      vars.horario_abertura = today.openTime
      vars.horario_fechamento = today.closeTime
    }
  }

  // Cliente pelo telefone (para nome/endereço fora do contexto de um pedido)
  if (phone) {
    const customer = await prisma.customer.findFirst({
      where: { tenantId, phone },
      select: { name: true, phone: true, address: true },
    })
    if (customer) {
      vars.nome_cliente = customer.name ?? ''
      vars.cliente_nome = customer.name ?? ''
      vars.telefone_cliente = customer.phone
      const addr = customer.address as any
      if (addr) {
        vars.endereco_cliente = [addr.street, addr.number, addr.district]
          .filter(Boolean).join(', ')
      }
    }
  }

  // Pedido específico OU o mais recente em andamento do telefone informado
  const order = orderId
    ? await prisma.order.findFirst({
        where: { id: orderId, tenantId },
        select: orderSelect,
      })
    : phone
      ? await prisma.order.findFirst({
          where: {
            tenantId,
            customer: { phone },
            status: { notIn: ['DELIVERED', 'CANCELLED', 'REFUNDED'] },
          },
          orderBy: { createdAt: 'desc' },
          select: orderSelect,
        })
      : null

  if (order) {
    vars.nome_cliente = order.customer?.name ?? vars.nome_cliente
    vars.cliente_nome = order.customer?.name ?? vars.cliente_nome
    vars.telefone_cliente = order.customer?.phone ?? vars.telefone_cliente
    vars.numero_pedido = String(order.orderNumber).padStart(4, '0')
    vars.valor_pedido = formatCurrency(Number(order.total))
    vars.itens_pedido = order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')
    vars.forma_pagamento = order.payments.map((p) => PAYMENT_LABELS[p.method] ?? p.method).join(' + ') || 'Não informado'
    vars.metodo_pagamento = vars.forma_pagamento
    vars.status_pagamento = order.paymentStatus === 'PAID' ? 'Pago' : order.paymentStatus === 'PENDING' ? 'Pendente' : order.paymentStatus
    vars.tipo_pedido = ORDER_TYPE_LABELS[order.type] ?? order.type
    vars.horario_pedido = order.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    vars.previsao_entrega = order.estimatedDeliveryAt
      ? order.estimatedDeliveryAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
      : ''
    if (order.deliveryAddress) {
      const addr = order.deliveryAddress as any
      vars.endereco_cliente = [addr.street, addr.number, addr.district].filter(Boolean).join(', ')
    }
    vars.link_pedido = tenant ? `${APP_URL}/menu/${tenant.slug}/pedido/${order.id}` : ''
    vars.link_rastreio = vars.link_pedido
  }

  return vars
}

const orderSelect = {
  id: true, orderNumber: true, type: true, status: true, paymentStatus: true,
  total: true, createdAt: true, estimatedDeliveryAt: true, deliveryAddress: true,
  customer: { select: { name: true, phone: true } },
  items: { select: { productName: true, quantity: true } },
  payments: { select: { method: true } },
} as const
