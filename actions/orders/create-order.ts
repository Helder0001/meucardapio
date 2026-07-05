'use server'

// actions/orders/create-order.ts
//
// Server Action que processa a criação de pedidos.
//
// FLUXO COMPLETO:
// 1. Validar dados de entrada com Zod
// 2. Buscar/criar cliente
// 3. Verificar OTP se primeiro pedido
// 4. Recalcular TUDO no servidor (segurança crítica)
// 5. Criar pedido e itens no banco (transação)
// 6. Gerar pagamentos (suporta múltiplos métodos)
// 7. Enfileirar notificação WhatsApp
// 8. Enfileirar impressão
// 9. Retornar orderId para redirecionar

import { z } from 'zod'
import { isValidCpf, onlyDigits } from '@/lib/utils/cpf'
import crypto from 'crypto'
import { checkAndPublishStockAlerts } from '@/lib/utils/stock-alerts'
import { decrementStockForOrder, revalidateStorefrontForTenant } from '@/lib/utils/stock'
import { prisma } from '@/lib/db/client'
import { calculateOrder } from '@/lib/utils/order-calculator'
import { formatCurrency } from '@/lib/utils/format'
import { getNextOrderNumber } from '@/lib/db/tenant'
import { publishOrderEvent } from '@/lib/cache/redis'
import { notifyOrderReceived } from '@/lib/messaging/evolution'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { queuePrintJob } from '@/lib/utils/print'
import { resolveTenantMpAccessToken } from '@/lib/mercadopago/resolve-token'

// VULN-NEW-03: gera um token HMAC de curta duração para autorizar
// o polling público de status do pedido sem exigir login do cliente.
function generateOrderStatusToken(orderId: string): string {
  const secret = process.env.ORDER_TOKEN_SECRET ?? process.env.AUTH_SECRET ?? ''
  return crypto.createHmac('sha256', secret).update(orderId).digest('hex')
}

// ── Schema de pagamento individual ──────────────────────────────────────────
const paymentEntrySchema = z.object({
  method: z.enum(['PIX', 'CASH', 'CARD', 'CREDIT_CARD', 'CREDIT_CARD_MANUAL', 'DEBIT_CARD']),
  amount: z.number().positive('Valor do pagamento deve ser positivo'),
  changeFor: z.number().positive().optional(),
})

const createOrderSchema = z.object({
  tenantId: z.string().cuid(),
  items: z.array(z.object({
    productId: z.string().cuid(),
    quantity: z.number().int().min(1).max(99),
    addonIds: z.array(z.string().cuid()),
    notes: z.string().max(200).optional(),
  })).min(1, 'Carrinho vazio'),
  type: z.enum(['TABLE', 'DELIVERY', 'PICKUP', 'PDV']),
  tableId: z.string().cuid().optional(),
  pdvId: z.string().optional(),            // PDV que criou o pedido
  createdByUserId: z.string().optional(),   // usuário que criou
  couponCode: z.string().max(50).optional(),
  deliveryBairro: z.string().max(100).optional(),
  customerPhone: z.string().min(10).max(20).optional(),
  customerName: z.string().max(100).optional(),

  // Múltiplos pagamentos (novo) — tem prioridade sobre paymentMethod + changeFor
  payments: z.array(paymentEntrySchema).min(1).max(5).optional(),

  // Campos legados (retrocompatibilidade com chamadas antigas)
  paymentMethod: z.enum(['PIX', 'CASH', 'CARD', 'CREDIT_CARD', 'CREDIT_CARD_MANUAL', 'DEBIT_CARD']).optional(),
  changeFor: z.number().positive().optional(),

  cashbackToUse:  z.number().min(0).optional(),
  pointsToRedeem: z.number().int().min(0).optional(),
  deliveryAddress: z.string().max(300).optional(),
  notes: z.string().max(500).optional(),

  // Device ID do Mercado Pago (gerado pelo security.js no navegador do
  // cliente/atendente) — enviado como header X-Meli-Session-Id na criação
  // do pagamento PIX, pra reduzir recusas de antifraude em pagamentos
  // criados via API direta (sem isso, o MP não tem nenhum sinal de
  // dispositivo, o que é tratado como suspeito).
  deviceId: z.string().optional(),

  // CPF real de quem vai pagar — obrigatório quando o pedido inclui PIX
  // pago na hora (não no link/Checkout Pro, onde o próprio MP coleta os
  // dados do pagador). Sem o CPF verdadeiro do pagador, o compliance de
  // Pix do Bacen rejeita o pagamento do lado do recebedor mesmo que o
  // cliente pague certinho pelo banco dele — daí o "Pagamento rejeitado
  // pelo PSP do recebedor" mesmo em pagamentos legítimos.
  customerCpf: z.string().optional(),

  // Pedido criado sem pagamento embutido porque o cliente escolheu "Link
  // de pagamento" no cardápio — o link (Checkout Pro) é gerado à parte,
  // logo depois, via /api/orders/[id]/payment-link. Sem essa flag, pedidos
  // de DELIVERY/PICKUP sem `payments`/`paymentMethod` seriam rejeitados
  // pela validação abaixo (só PDV/TABLE têm essa isenção por padrão, para
  // o fluxo de "cobrar no final").
  deferPaymentLink: z.boolean().optional(),
})
  // CORREÇÃO: endereço de entrega agora é obrigatório no servidor para
  // pedidos do tipo DELIVERY — validação no cart-drawer (cliente) pode ser
  // contornada, então validamos novamente aqui.
  .refine(
    (data) => data.type !== 'DELIVERY' || (data.deliveryAddress && data.deliveryAddress.trim().length >= 5),
    { message: 'Endereço de entrega é obrigatório para pedidos com entrega', path: ['deliveryAddress'] }
  )
  .refine(
    (data) => !data.payments?.some((p) => p.method === 'PIX') || isValidCpf(data.customerCpf ?? ''),
    { message: 'CPF inválido — obrigatório para pagamento via PIX', path: ['customerCpf'] }
  )

type CreateOrderInput = z.infer<typeof createOrderSchema>

interface CreateOrderResult {
  orderId?: string
  statusToken?: string          // ← ADICIONADO: token para polling de status
  paymentData?: {
    method: string
    pixQrCode?: string
    pixQrCodeBase64?: string
    total: number
    payments?: Array<{ method: string; amount: number }>
  }
  error?: string
}

export async function createOrderAction(
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  // 1. Validar entrada com Zod
  const parsed = createOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  // Normalizar: construir lista canônica de pagamentos
  // Se vier `payments` (novo campo), usa ele. Caso contrário, usa legado.
  const paymentsList: Array<{ method: string; amount: number; changeFor?: number }> =
    data.payments
      ? data.payments.map((p) => ({ method: p.method, amount: p.amount, changeFor: p.changeFor }))
      : data.paymentMethod
        ? [{ method: data.paymentMethod, amount: 0 /* será preenchido com o total calculado */, changeFor: data.changeFor }]
        : []

  if (paymentsList.length === 0 && data.type !== 'PDV' && data.type !== 'TABLE' && !data.deferPaymentLink) {
    return { error: 'Informe pelo menos uma forma de pagamento' }
  }
  // PDV e TABLE sem pagamento = "cobrar no final" — pedido criado sem pagamento registrado
  // DELIVERY/PICKUP com deferPaymentLink = cliente escolheu "Link de pagamento" no cardápio

  // 2. Verificar se tenant existe e está ativo
  const tenant = await prisma.tenant.findFirst({
    where: { id: data.tenantId, isActive: true },
    select: { id: true, subscriptionStatus: true },
  })

  if (!tenant || tenant.subscriptionStatus === 'SUSPENDED') {
    return { error: 'Estabelecimento não disponível' }
  }

  // 3. Buscar ou criar cliente
  let customer = null
  if (data.customerPhone) {
    const phone = data.customerPhone.replace(/\D/g, '')
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`

    customer = await prisma.customer.findFirst({
      where: { phone: fullPhone, tenantId: data.tenantId },
    })

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          tenantId: data.tenantId,
          phone: fullPhone,
          name: data.customerName,
          cpf: data.customerCpf ? onlyDigits(data.customerCpf) : undefined,
          lgpdConsent: true,
          lgpdConsentAt: new Date(),
        },
      })
    } else if ((data.customerName && !customer.name) || (data.customerCpf && !customer.cpf)) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...(data.customerName && !customer.name ? { name: data.customerName } : {}),
          ...(data.customerCpf && !customer.cpf ? { cpf: onlyDigits(data.customerCpf) } : {}),
        },
      })
    }
  }

  // Fallback: cliente recorrente que já tem CPF salvo de uma compra
  // anterior, mas o formulário desta compra não reenviou o campo.
  const effectiveCpf = data.customerCpf ?? customer?.cpf ?? undefined

  // 4. ⚠️  RECALCULAR TUDO NO SERVIDOR ⚠️
  const calculation = await calculateOrder({
    tenantId: data.tenantId,
    items: data.items,
    couponCode: data.couponCode,
    deliveryBairro: data.deliveryBairro,
    deliveryType: data.type === 'DELIVERY' ? 'DELIVERY' : undefined,
    customerId: customer?.id,
    cashbackToUse:  data.cashbackToUse,
    pointsToRedeem: data.pointsToRedeem,
  })

  if (calculation.errors.length > 0) {
    return { error: calculation.errors[0] }
  }

  // Validar e preencher amounts — só quando há pagamentos (cobrar agora)
  if (paymentsList.length > 0) {
    if (data.payments) {
      const sumPaid = data.payments.reduce((s, p) => s + p.amount, 0)
      if (Math.abs(sumPaid - calculation.total) > 0.05) {
        return { error: `Total dos pagamentos (${sumPaid.toFixed(2)}) não confere com o valor do pedido (${calculation.total.toFixed(2)})` }
      }
      paymentsList.forEach((p) => {
        if (p.amount === 0) p.amount = calculation.total
      })
    } else {
      paymentsList[0].amount = calculation.total
    }
  }
  // paymentsList vazio = "cobrar no final" para pedidos PDV

  // 5. Criar pedido em transação
  const orderNumber = await getNextOrderNumber(data.tenantId)

  const txResult = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        tenantId: data.tenantId,
        orderNumber,
        type: data.type,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        tableId: data.tableId,
        pdvId: data.pdvId,
        createdById: data.createdByUserId,
        customerId: customer?.id,
        couponId: calculation.coupon?.id,
        couponCode: calculation.coupon?.code,
        couponDiscount: calculation.couponDiscount,
        deliveryBairro: data.deliveryBairro,
        deliveryAddress: data.deliveryAddress ? { address: data.deliveryAddress } : undefined,
        notes: data.notes ?? undefined,
        // changeFor: apenas o primeiro pagamento em dinheiro (legado — mantém compatibilidade)
        changeFor: paymentsList.find((p) => p.method === 'CASH')?.changeFor,

        subtotal: calculation.subtotal,
        deliveryFee: calculation.deliveryFee,
        discountAmount: calculation.couponDiscount,
        cashbackUsed: calculation.cashbackUsed,
        total: calculation.total,

        items: {
          create: calculation.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            productPrice: item.productPrice,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            notes: item.notes,
            addons: {
              create: item.addons.map((addon) => ({
                addonId: addon.addonId,
                addonName: addon.addonName,
                addonPrice: addon.addonPrice,
              })),
            },
          })),
        },

        statusHistory: {
          create: { status: 'PENDING' },
        },
      },
    })

    // Decrementar estoque dos produtos vendidos (com proteção contra
    // concorrência e registro de histórico — ver lib/utils/stock.ts)
    const { affectedProductIds } = await decrementStockForOrder(tx, {
      tenantId: data.tenantId,
      orderId: newOrder.id,
      items: calculation.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    })

    if (calculation.coupon) {
      await tx.coupon.update({
        where: { id: calculation.coupon.id },
        data: { usageCount: { increment: 1 } },
      })
    }

    if (calculation.cashbackUsed > 0 && customer) {
      await tx.customer.update({
        where: { id: customer.id },
        data: { cashbackBalance: { decrement: calculation.cashbackUsed } },
      })
      await tx.cashbackTransaction.create({
        data: {
          tenantId: data.tenantId,
          customerId: customer.id,
          orderId: newOrder.id,
          type: 'USE',
          amount: -calculation.cashbackUsed,
          balance: Number(customer.cashbackBalance) - calculation.cashbackUsed,
        },
      })
    }

    // Debitar pontos resgatados
    if (calculation.pointsRedeemed > 0 && customer) {
      await tx.customer.update({
        where: { id: customer.id },
        data: { loyaltyPoints: { decrement: calculation.pointsRedeemed } },
      })
      await tx.loyaltyTransaction.create({
        data: {
          tenantId: data.tenantId,
          customerId: customer.id,
          orderId: newOrder.id,
          type: 'REDEEM',
          points: -calculation.pointsRedeemed,
          balance: customer.loyaltyPoints - calculation.pointsRedeemed,
          description: `Resgate: ${calculation.pointsRedeemed} pts = ${formatCurrency(calculation.pointsDiscount)} de desconto`,
        },
      })
    }

    if (customer) {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: { increment: 1 },
          totalSpent: { increment: calculation.total },
          lastOrderAt: new Date(),
        },
      })
    }

    return { newOrder, affectedProductIds }
  })

  // Revalida o cardápio digital se algum produto pode ter zerado o
  // estoque com esta venda — fora da transação, é só efeito de cache.
  if (txResult.affectedProductIds.length > 0) {
    await revalidateStorefrontForTenant(data.tenantId)
  }
  const order = txResult.newOrder

  // 6. Criar registros de pagamento (um por forma de pagamento)
  let pixResult: { pixQrCode?: string; pixQrCodeBase64?: string } | null = null

  // Pagamento definido na hora da criação (PDV/Mesa com "pagar agora"),
  // criado pelo dashboard — usado para esconder "trocar forma de pagamento"
  const isImmediatePdvPayment =
    !!data.createdByUserId && (data.type === 'PDV' || data.type === 'TABLE')

  for (const payment of paymentsList) {
    if (payment.method === 'PIX') {
      try {
        pixResult = await createPixPayment({
          tenantId: data.tenantId,
          orderId: order.id,
          amount: payment.amount,
          customerPhone: data.customerPhone,
          customerName: data.customerName,
          customerCpf: effectiveCpf,
          deviceId: data.deviceId,
        })
      } catch (err) {
        console.error('[createOrder] PIX creation failed:', err)
        // Não bloqueia o pedido — cliente pode tentar novamente
      }
    } else {
      await prisma.payment.create({
        data: {
          tenantId: data.tenantId,
          orderId: order.id,
          method: payment.method === 'CARD' ? 'DEBIT_CARD' : payment.method as any,
          status: 'PENDING',
          amount: payment.amount,
          changeAmount: payment.changeFor,
          setAtOrderCreation: isImmediatePdvPayment,
        },
      })
    }
  }

  // 7. Publicar evento para o kanban em tempo real
  await publishOrderEvent(data.tenantId, {
    type: 'ORDER_CREATED',
    orderId: order.id,
    orderNumber,
    status: 'PENDING',
    total: calculation.total,
    type_order: data.type,
  })

  // 8. Audit log
  await auditLog({
    tenantId: data.tenantId,
    action: AuditActions.ORDER_CREATED,
    resource: 'orders',
    resourceId: order.id,
    newValue: {
      orderNumber,
      total: calculation.total,
      type: data.type,
      payments: paymentsList.map((p) => ({ method: p.method, amount: p.amount })),
    },
  })

  // 9. Notificação WhatsApp (fire-and-forget)
  notifyOrderReceived(order.id).catch((err) =>
    console.error('[createOrder] WhatsApp notification failed:', err)
  )

  // 10. Enfileirar impressão em todas as impressoras ativas do tenant/PDV
  queuePrintJob(order.id, 'KITCHEN').catch((err) =>
    console.error('[createOrder] Print job failed:', err)
  )
  queuePrintJob(order.id, 'COUNTER').catch(() => {
    // Setor COUNTER é opcional — não loga erro se não houver impressoras
  })

  // VULN-NEW-03 CORRIGIDO: gerar token de status para o cliente do storefront
  const statusToken = generateOrderStatusToken(order.id)

  return {
    orderId: order.id,
    statusToken,
    paymentData: paymentsList.length > 0 ? {
      method: paymentsList[0].method,
      total: calculation.total,
      pixQrCode: pixResult?.pixQrCode,
      pixQrCodeBase64: pixResult?.pixQrCodeBase64,
      payments: paymentsList.map((p) => ({ method: p.method, amount: p.amount })),
    } : {
      method: 'PENDING',
      total: calculation.total,
      payments: [],
    },
  }
}

// ── Cria pagamento PIX no Mercado Pago ──────────────────────────────────────
async function createPixPayment(params: {
  tenantId: string
  orderId: string
  amount: number
  customerPhone?: string
  customerName?: string
  customerCpf?: string
  deviceId?: string
}) {
  const accessToken = await resolveTenantMpAccessToken(params.tenantId)

  if (!accessToken) {
    throw new Error('Mercado Pago não configurado')
  }

  const response = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `${params.orderId}-pix-${params.amount}`,
      // Device ID (gerado pelo security.js do MP no navegador do cliente
      // ou do atendente) — ajuda o antifraude do MP a diferenciar pagamentos
      // legítimos de chamadas "cegas" via API, reduzindo recusas do tipo
      // "Pagamento rejeitado pelo PSP do recebedor". Opcional: se o
      // frontend não mandou (script bloqueado, ad-blocker, etc.), seguimos
      // sem o header — não bloqueia a criação do PIX.
      ...(params.deviceId ? { 'X-Meli-Session-Id': params.deviceId } : {}),
    },
    body: JSON.stringify({
      transaction_amount: params.amount,
      payment_method_id: 'pix',
      payer: {
        // CORREÇÃO: usava CPF de teste fixo (11144477735) pra QUALQUER
        // pagador — passava no dígito verificador, mas não era o CPF de
        // quem realmente ia pagar. O compliance de Pix do Bacen valida
        // isso do lado do recebedor: CPF declarado ≠ CPF de quem pagou de
        // fato = rejeição ("Pagamento rejeitado pelo PSP do recebedor"),
        // mesmo com o cliente pagando certinho pelo banco dele. Agora
        // exigimos o CPF real (validado em createOrderSchema) sempre que
        // o pedido inclui PIX pago na hora.
        email: 'cliente@meucardapio.app',
        identification: { type: 'CPF', number: onlyDigits(params.customerCpf ?? '') },
      },
      description: `Pedido #${params.orderId.slice(-8).toUpperCase()}`,
      external_reference: params.orderId,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`,
      date_of_expiration: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`MP Error: ${JSON.stringify(error)}`)
  }

  const mpData = await response.json()

  await prisma.payment.create({
    data: {
      tenantId: params.tenantId,
      orderId: params.orderId,
      method: 'PIX',
      status: 'PENDING',
      amount: params.amount,
      mercadoPagoId: String(mpData.id),
      mercadoPagoStatus: mpData.status,
      pixQrCode: mpData.point_of_interaction?.transaction_data?.qr_code,
      pixQrCodeBase64: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
      pixExpiresAt: mpData.date_of_expiration ? new Date(mpData.date_of_expiration) : new Date(Date.now() + 5 * 60 * 1000),
    },
  })

  return {
    pixQrCode: mpData.point_of_interaction?.transaction_data?.qr_code,
    pixQrCodeBase64: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
  }
}
