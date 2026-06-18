// lib/messaging/evolution.ts

import { prisma } from '@/lib/db/client'
import { formatCurrency } from '@/lib/utils/format'

// ✅ Credenciais vêm das env vars — não do banco
const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!

interface SendMessageParams {
  tenantId: string
  phone:    string
  message:  string
}

async function getConfig(tenantId: string) {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) {
    console.error('[evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados')
    return null
  }

  // Só verifica se o tenant tem WhatsApp conectado no banco
  const config = await prisma.whatsappConfig.findFirst({
    where:  { tenantId, status: 'CONNECTED' },
    select: { instanceName: true },
  })
  if (!config) return null

  return {
    url:      EVOLUTION_URL,
    apiKey:   EVOLUTION_KEY,
    instance: config.instanceName,
  }
}

export async function sendWhatsAppMessage({ tenantId, phone, message }: SendMessageParams) {
  const config = await getConfig(tenantId)
  if (!config) return { error: 'WhatsApp não configurado ou desconectado' }

  const digits    = phone.replace(/\D/g, '')
  const fullPhone = digits.startsWith('55') ? digits : `55${digits}`

  try {
    const res = await fetch(
      `${config.url}/message/sendText/${config.instance}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
        body:    JSON.stringify({
          number: fullPhone,
          text:   message,
          delay:  1200,
        }),
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!res.ok) return { error: 'Falha ao enviar mensagem' }
    return { ok: true }
  } catch (err) {
    console.error('[evolution] Erro ao enviar mensagem:', err)
    return { error: 'Erro de conexão' }
  }
}

// ─── Templates de status (mensagens curtas de atualização) ───────────────────

const STATUS_TEMPLATES: Record<string, (n: number, url: string) => string> = {
  ORDER_CONFIRMED:  (n, u) => `✅ *Pedido #${String(n).padStart(4,'0')} confirmado!*\nEstá entrando na fila da cozinha agora. 👨‍🍳\n🔗 Acompanhe: ${u}`,
  ORDER_PREPARING:  (n, u) => `👨‍🍳 *Pedido #${String(n).padStart(4,'0')} em preparo!*\nNossa equipe está preparando com carinho. ❤️\n🔗 Acompanhe: ${u}`,
  READY:            (n, u) => `📦 *Pedido #${String(n).padStart(4,'0')} pronto!*\nAguardando entrega/retirada.\n🔗 Acompanhe: ${u}`,
  OUT_FOR_DELIVERY: (n, u) => `🛵 *Pedido #${String(n).padStart(4,'0')} saiu para entrega!*\nEstá a caminho da sua casa. 🏠\n🔗 Acompanhe: ${u}`,
  DELIVERED:        (n, u) => `🎊 *Pedido #${String(n).padStart(4,'0')} entregue!*\nBom apetite! Esperamos que goste. 😋\n⭐ Avalie seu pedido: ${u}`,
  CANCELLED:        (n)    => `❌ *Pedido #${String(n).padStart(4,'0')} cancelado.*\nEntre em contato conosco se precisar de ajuda.`,
}

// ─── Mensagem rica de PEDIDO RECEBIDO com todos os detalhes ─────────────────

async function buildOrderReceivedMessage(orderId: string): Promise<string | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId },
    select: {
      orderNumber:    true,
      type:           true,
      total:          true,
      subtotal:       true,
      deliveryFee:    true,
      discountAmount: true,
      deliveryBairro: true,
      notes:          true,
      tenant: { select: { name: true, slug: true } },
      table:  { select: { number: true, sector: true } },
      items: {
        select: {
          productName: true,
          quantity:    true,
          totalPrice:  true,
          notes:       true,
          addons: { select: { addonName: true } },
        },
      },
      payments: {
        select: { method: true },
      },
    },
  })
  if (!order) return null

  const num = String(order.orderNumber).padStart(4, '0')
  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/menu/${order.tenant.slug}/pedido/${orderId}`

  // Tipo do pedido
  const typeLabel =
    order.type === 'DELIVERY' ? `🛵 Entrega — ${order.deliveryBairro ?? ''}` :
    order.type === 'TABLE'    ? `🍽 Mesa ${order.table?.number ?? ''}${order.table?.sector ? ` (${order.table.sector})` : ''}` :
    order.type === 'PICKUP'   ? '🏃 Retirada no local' :
    '🖥 PDV / Balcão'

  // Forma de pagamento baseada nos registros de pagamento
  const paymentMethods = order.payments.map(p => p.method)
  const paymentLabel = paymentMethods.length
    ? paymentMethods.map(method => {
        switch (method) {
          case 'PIX':         return '⚡ PIX'
          case 'CREDIT_CARD': return '💳 Cartão de Crédito'
          case 'DEBIT_CARD':  return '💳 Cartão de Débito'
          case 'CASH':        return '💵 Dinheiro'
          case 'VOUCHER':     return '🎟️ Voucher'
          case 'CASHBACK':    return '💰 Cashback'
          default:            return method
        }
      }).join(' + ')
    : 'Não informado'

  // Linha de itens
  const itemLines = order.items.map((item) => {
    let line = `  • ${item.quantity}x ${item.productName} — ${formatCurrency(Number(item.totalPrice))}`
    if (item.addons.length > 0) {
      line += `\n    ↳ ${item.addons.map((a) => a.addonName).join(', ')}`
    }
    if (item.notes) line += `\n    📝 "${item.notes}"`
    return line
  }).join('\n')

  // Totais
  const subtotal    = Number(order.subtotal)
  const deliveryFee = Number(order.deliveryFee)
  const discountAmt = Number(order.discountAmount)
  const total       = Number(order.total)

  let totalsSection = `  Subtotal: ${formatCurrency(subtotal)}`
  if (deliveryFee > 0) totalsSection += `\n  Taxa de entrega: ${formatCurrency(deliveryFee)}`
  if (discountAmt > 0) totalsSection += `\n  Desconto: -${formatCurrency(discountAmt)}`
  totalsSection += `\n  *Total: ${formatCurrency(total)}*`

  // Observações gerais
  const notesSection = order.notes ? `\n📝 *Obs:* ${order.notes}` : ''

  return (
`🎉 *Pedido #${num} recebido!*
${order.tenant.name}

📋 *Itens do pedido:*
${itemLines}

💰 *Valores:*
${totalsSection}

${typeLabel}
${paymentLabel}${notesSection}

🔗 Acompanhe aqui: ${trackingUrl}`
  )
}

// ─── Notificar pedido recebido (mensagem rica) ───────────────────────────────

export async function notifyOrderReceived(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId },
    select: {
      tenantId: true,
      customer: { select: { phone: true } },
    },
  })
  if (!order?.customer?.phone) return

  const message = await buildOrderReceivedMessage(orderId)
  if (!message) return

  await sendWhatsAppMessage({
    tenantId: order.tenantId,
    phone:    order.customer.phone,
    message,
  })
}

// ─── Notificar mudança de status (mensagem curta) ────────────────────────────

export async function notifyOrderStatus(
  orderId: string,
  event: keyof typeof STATUS_TEMPLATES
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId },
    select: {
      tenantId:    true,
      orderNumber: true,
      customer:    { select: { phone: true } },
      tenant:      { select: { slug: true } },
    },
  })
  if (!order?.customer?.phone) return

  const fn = STATUS_TEMPLATES[event]
  if (!fn) return

  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/menu/${order.tenant.slug}/pedido/${orderId}`

  await sendWhatsAppMessage({
    tenantId: order.tenantId,
    phone:    order.customer.phone,
    message:  fn(order.orderNumber, trackingUrl),
  })
}
