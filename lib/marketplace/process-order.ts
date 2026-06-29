// lib/marketplace/process-order.ts
//
// Transforma um NormalizedMarketplaceOrder (já traduzido pelo client do
// provider) em um Order interno de verdade — mesma tabela usada pelo
// cardápio próprio, PDV, mesas etc. Assim o pedido do iFood/99Food aparece
// no Kanban, na impressão de cozinha, nos relatórios, tudo igual.
//
// DIFERENÇA IMPORTANTE em relação a actions/orders/create-order.ts:
// lá recalculamos os valores no servidor porque o cliente (frontend) não é
// confiável. Aqui o "cliente" é a própria plataforma do marketplace (iFood/
// 99Food), que já fez a cobrança do consumidor e é a fonte de verdade do
// valor — não há recálculo de preço, usamos os valores que vieram no pedido.
// O que fazemos é validar que os totais batem (subtotal + taxas - descontos
// = total) antes de gravar, para detectar payload corrompido/inesperado.

import { prisma } from '@/lib/db/client'
import { getNextOrderNumber } from '@/lib/db/tenant'
import { decrementStockForOrder, revalidateStorefrontForTenant } from '@/lib/utils/stock'
import { publishOrderEvent } from '@/lib/cache/redis'
import { notifyOrderReceived } from '@/lib/messaging/evolution'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { queuePrintJob } from '@/lib/utils/print'
import type { NormalizedMarketplaceOrder } from './types'
import type { MarketplaceConnection, PrismaClient } from '@prisma/client'

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

const TOTAL_TOLERANCE = 0.05 // tolerância de arredondamento, em reais

interface ProcessResult {
  orderId?: string
  error?: string
}

/**
 * Cria (ou recupera, se já processado) o Order interno correspondente a um
 * MarketplaceOrder. Idempotente: chamar duas vezes para o mesmo pedido
 * externo não duplica — graças ao @@unique([provider, externalOrderId]).
 */
export async function processMarketplaceOrder(
  connection: MarketplaceConnection,
  normalized: NormalizedMarketplaceOrder
): Promise<ProcessResult> {
  const tenantId = connection.tenantId

  // Idempotência: já existe um MarketplaceOrder para este pedido externo?
  const existing = await prisma.marketplaceOrder.findUnique({
    where: { provider_externalOrderId: { provider: normalized.provider, externalOrderId: normalized.externalOrderId } },
  })
  if (existing?.orderId) {
    return { orderId: existing.orderId }
  }

  // Sanidade dos valores informados pela plataforma — não recalculamos,
  // mas não confiamos ciegamente em um total que não bate com os itens.
  const computedSubtotal = normalized.items.reduce((sum, item) => sum + item.totalPrice, 0)
  const expectedTotal = computedSubtotal + normalized.deliveryFee - normalized.discountAmount
  if (Math.abs(expectedTotal - normalized.total) > TOTAL_TOLERANCE) {
    await upsertMarketplaceOrderRecord(connection, normalized, { status: 'RECEIVED', syncError: 'Totais inconsistentes no payload recebido' })
    return { error: 'Totais do pedido não conferem — pedido salvo para revisão manual, não enviado à cozinha automaticamente.' }
  }

  // Cliente: localizar/criar por telefone, igual ao fluxo interno —
  // mantém histórico de pedidos consolidado mesmo vindo de canais diferentes.
  let customerId: string | undefined
  if (normalized.customerPhone) {
    const phone = normalized.customerPhone.replace(/\D/g, '')
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`
    const customer = await prisma.customer.upsert({
      where: { phone_tenantId: { phone: fullPhone, tenantId } },
      update: normalized.customerName ? { name: normalized.customerName } : {},
      create: {
        tenantId,
        phone: fullPhone,
        name: normalized.customerName,
        lgpdConsent: true, // consentimento já coberto pelos termos do marketplace
        lgpdConsentAt: new Date(),
      },
    })
    customerId = customer.id
  }

  // Tentar mapear itens do pedido externo para produtos internos (para
  // baixa de estoque). Itens sem mapeamento ainda entram no pedido, mas
  // usam um Product "placeholder" do tenant (não baixam estoque real,
  // não aparecem no cardápio) — schema não exige productId opcional.
  const mappings = await prisma.marketplaceProductMapping.findMany({
    where: { connectionId: connection.id, isActive: true },
    select: { productId: true, externalItemId: true },
  })
  const mappingByExternalId = new Map<string, string>(
    mappings
      .filter((m: { productId: string; externalItemId: string | null }) => Boolean(m.externalItemId))
      .map((m: { productId: string; externalItemId: string | null }) => [m.externalItemId as string, m.productId])
  )
  const placeholderProductId = await getOrCreateExternalPlaceholderProduct(tenantId)

  const orderNumber = await getNextOrderNumber(tenantId)

  const txResult = await prisma.$transaction(async (tx: Tx) => {
    const newOrder = await tx.order.create({
      data: {
        tenantId,
        orderNumber,
        type: 'DELIVERY',
        status: 'CONFIRMED', // já confirmamos na plataforma antes de chamar esta função
        paymentStatus: normalized.isPaidOnline ? 'PAID' : 'PENDING',
        customerId,
        notes: buildOrderNotes(normalized),
        deliveryBairro: normalized.deliveryAddress?.neighborhood,
        deliveryAddress: normalized.deliveryAddress
          ? { ...normalized.deliveryAddress }
          : undefined,
        subtotal: normalized.subtotal || computedSubtotal,
        deliveryFee: normalized.deliveryFee,
        discountAmount: normalized.discountAmount,
        total: normalized.total,
        items: {
          create: normalized.items.map((item) => ({
            productId: mappingByExternalId.get(item.externalItemId) ?? placeholderProductId,
            productName: item.name,
            productPrice: item.unitPrice,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            notes: [item.notes, item.addons.map((a) => a.name).join(', ')].filter(Boolean).join(' · ') || undefined,
          })),
        },
      },
    })

    const mappedItems = normalized.items
      .map((item) => ({ productId: mappingByExternalId.get(item.externalItemId), quantity: item.quantity }))
      .filter((i): i is { productId: string; quantity: number } => Boolean(i.productId))

    let affectedProductIds: string[] = []
    if (mappedItems.length > 0) {
      const result = await decrementStockForOrder(tx, { tenantId, orderId: newOrder.id, items: mappedItems })
      affectedProductIds = result.affectedProductIds
    }

    if (customerId) {
      await tx.customer.update({
        where: { id: customerId },
        data: { totalOrders: { increment: 1 }, totalSpent: { increment: normalized.total }, lastOrderAt: new Date() },
      })
    }

    return { newOrder, affectedProductIds }
  })

  if (txResult.affectedProductIds.length > 0) {
    await revalidateStorefrontForTenant(tenantId)
  }

  const order = txResult.newOrder

  await upsertMarketplaceOrderRecord(connection, normalized, {
    status: 'CONFIRMED',
    orderId: order.id,
    confirmedAt: new Date(),
  })

  await publishOrderEvent(tenantId, {
    type: 'ORDER_CREATED',
    orderId: order.id,
    orderNumber,
    status: 'CONFIRMED',
    total: normalized.total,
    type_order: 'DELIVERY',
    source: normalized.provider,
  })

  await auditLog({
    tenantId,
    action: AuditActions.ORDER_CREATED,
    resource: 'orders',
    resourceId: order.id,
    newValue: { orderNumber, total: normalized.total, type: 'DELIVERY', source: normalized.provider },
  })

  if (!normalized.isVirtualPhone) {
    notifyOrderReceived(order.id).catch((err) =>
      console.error('[marketplace] WhatsApp notification failed:', err)
    )
  }

  queuePrintJob(order.id, 'KITCHEN').catch((err) =>
    console.error('[marketplace] Print job failed:', err)
  )

  return { orderId: order.id }
}

function buildOrderNotes(normalized: NormalizedMarketplaceOrder): string {
  const parts = [`Pedido via ${normalized.provider === 'IFOOD' ? 'iFood' : '99Food'} #${normalized.externalDisplayId ?? normalized.externalOrderId.slice(-6)}`]
  if (normalized.notes) parts.push(normalized.notes)
  return parts.join(' — ')
}

async function upsertMarketplaceOrderRecord(
  connection: MarketplaceConnection,
  normalized: NormalizedMarketplaceOrder,
  extra: { status: 'RECEIVED' | 'CONFIRMED'; orderId?: string; confirmedAt?: Date; syncError?: string }
) {
  await prisma.marketplaceOrder.upsert({
    where: {
      provider_externalOrderId: { provider: normalized.provider, externalOrderId: normalized.externalOrderId },
    },
    update: {
      status: extra.status,
      orderId: extra.orderId,
      confirmedAt: extra.confirmedAt,
      syncError: extra.syncError ?? null,
      rawPayload: normalized.rawPayload as any,
    },
    create: {
      tenantId: connection.tenantId,
      connectionId: connection.id,
      provider: normalized.provider,
      externalOrderId: normalized.externalOrderId,
      externalDisplayId: normalized.externalDisplayId,
      status: extra.status,
      orderId: extra.orderId,
      confirmedAt: extra.confirmedAt,
      syncError: extra.syncError,
      grossAmount: normalized.total,
      deliveredBy: normalized.deliveredBy,
      rawPayload: normalized.rawPayload as any,
    },
  })
}

// ── Produto/categoria "placeholder" para itens sem mapeamento ──────────────
//
// O schema de OrderItem exige um productId válido (regra histórica do
// sistema). Itens de pedidos do marketplace que AINDA não foram vinculados
// a um produto do cardápio (ver MarketplaceProductMapping) usam um Product
// interno especial: inativo, fora de qualquer categoria visível, que nunca
// aparece no storefront nem conta em rankings de vendas. O nome e preço
// reais do item ficam de qualquer forma salvos em OrderItem.productName /
// unitPrice (snapshot) — o placeholder serve só para satisfazer a FK.
//
// Recomendação operacional: o lojista deve mapear os produtos do marketplace
// aos produtos do cardápio em /dashboard/settings/integrations assim que
// possível, para que a baixa de estoque funcione automaticamente.

const PLACEHOLDER_CATEGORY_NAME = '__marketplace_unmapped__'
const PLACEHOLDER_PRODUCT_NAME = '__marketplace_unmapped_item__'

async function getOrCreateExternalPlaceholderProduct(tenantId: string): Promise<string> {
  const existing = await prisma.product.findFirst({
    where: { tenantId, sku: PLACEHOLDER_PRODUCT_NAME },
    select: { id: true },
  })
  if (existing) return existing.id

  let category = await prisma.category.findFirst({
    where: { tenantId, name: PLACEHOLDER_CATEGORY_NAME },
    select: { id: true },
  })
  if (!category) {
    category = await prisma.category.create({
      data: { tenantId, name: PLACEHOLDER_CATEGORY_NAME, isActive: false, sortOrder: 9999 },
      select: { id: true },
    })
  }

  const product = await prisma.product.create({
    data: {
      tenantId,
      categoryId: category.id,
      name: 'Item de marketplace (não mapeado)',
      price: 0,
      sku: PLACEHOLDER_PRODUCT_NAME,
      isActive: false,
    },
    select: { id: true },
  })
  return product.id
}
