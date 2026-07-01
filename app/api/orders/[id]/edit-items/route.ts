// app/api/orders/[id]/edit-items/route.ts
//
// Edita os itens (produtos/quantidades) de um pedido já criado — permite ao
// lojista adicionar, remover ou mudar a quantidade de itens quando o
// cliente pede alguma alteração ANTES do pedido ser cancelado/entregue.
//
// Regras:
//   - Bloqueado para pedidos DELIVERED, CANCELLED ou REFUNDED.
//   - Preços SEMPRE recalculados no servidor a partir do catálogo atual
//     (nunca confiar em preço vindo do cliente — mesma regra de
//     lib/utils/order-calculator.ts).
//   - Taxa de entrega, desconto de cupom e cashback usado são mantidos
//     como estavam no pedido original; esta rota só recalcula o
//     subtotal/total a partir dos itens. Editar itens de um pedido com
//     cupom "pedido mínimo" ou cashback aplicado pode exigir conferência
//     manual do lojista — não bloqueamos, mas não re-validamos essas regras.
//   - Estoque é ajustado pela DIFERENÇA entre a lista antiga e a nova
//     (decrementa o que aumentou, devolve o que diminuiu/foi removido).
//   - Se o pedido tem exatamente 1 pagamento PENDING e nenhum PAID (ex.:
//     "cobrar no final" ou pagamento único ainda não confirmado), o valor
//     desse pagamento é ajustado automaticamente para o novo total. Nos
//     demais casos (pagamentos já confirmados, ou múltiplos pendentes), o
//     valor dos pagamentos não é tocado — use "Registrar pagamento" para
//     cobrir uma diferença a mais.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { publishOrderEvent } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { decrementStockForOrder, restockOrderItems, revalidateStorefrontForTenant } from '@/lib/utils/stock'
import { z } from 'zod'

const itemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().min(1).max(99),
  addonIds: z.array(z.string().cuid()).default([]),
  notes: z.string().max(200).optional(),
})

const bodySchema = z.object({
  items: z.array(itemSchema).min(1, 'O pedido precisa ter ao menos 1 item'),
})

const ALLOWED_ROLES = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF']
const LOCKED_STATUSES = ['DELIVERED', 'CANCELLED', 'REFUNDED']

// Chave de agrupamento: mesmo produto + mesmo conjunto de adicionais.
// Trocar os adicionais de um item é tratado como remover o item antigo
// e adicionar um novo (não editamos adicionais de uma linha existente).
function itemKey(productId: string, addonIds: string[]): string {
  return `${productId}::${[...addonIds].sort().join(',')}`
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id: orderId } = await params
  const tenantId = session.user.tenantId

  let rawBody: unknown
  try { rawBody = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true, orderNumber: true, status: true, type: true,
      subtotal: true, deliveryFee: true, discountAmount: true, cashbackUsed: true, total: true,
      items: { select: { id: true, productId: true, quantity: true, addons: { select: { addonId: true } } } },
      payments: { select: { id: true, method: true, status: true, amount: true } },
    },
  })
  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  }
  if (LOCKED_STATUSES.includes(order.status)) {
    return NextResponse.json({ error: 'Este pedido não pode mais ser editado.' }, { status: 422 })
  }

  const newItemsInput = parsed.data.items

  // ── Buscar produtos e adicionais atuais do catálogo (nunca confiar no preço do cliente) ──
  const productIds = [...new Set(newItemsInput.map((i) => i.productId))]
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId, isActive: true },
    include: { stocks: { select: { pdvId: true, quantity: true } } },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const addonIds = [...new Set(newItemsInput.flatMap((i) => i.addonIds))]
  const addons = addonIds.length > 0
    ? await prisma.addon.findMany({ where: { id: { in: addonIds }, tenantId, isActive: true } })
    : []
  const addonMap = new Map(addons.map((a) => [a.id, a]))

  const errors: string[] = []
  const resolved = newItemsInput.map((item) => {
    const product = productMap.get(item.productId)
    if (!product) { errors.push('Produto não disponível'); return null }

    let addonTotal = 0
    const resolvedAddons: Array<{ addonId: string; addonName: string; addonPrice: number }> = []
    for (const aId of item.addonIds) {
      const addon = addonMap.get(aId)
      if (!addon) { errors.push('Adicional inválido'); continue }
      addonTotal += Number(addon.price)
      resolvedAddons.push({ addonId: addon.id, addonName: addon.name, addonPrice: Number(addon.price) })
    }

    const productPrice = Number(product.price)
    const unitPrice = productPrice + addonTotal
    return {
      productId: product.id,
      productName: product.name,
      productPrice,
      quantity: item.quantity,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
      notes: item.notes,
      addonIds: item.addonIds,
      addons: resolvedAddons,
    }
  })
  if (errors.length > 0 || resolved.some((i) => i === null)) {
    return NextResponse.json({ error: errors[0] ?? 'Item inválido' }, { status: 422 })
  }
  const finalItems = resolved as NonNullable<(typeof resolved)[number]>[]

  // ── Diff com os itens atuais do pedido ────────────────────────────────
  const oldByKey = new Map<string, { id: string; productId: string; quantity: number }>()
  for (const it of order.items) {
    oldByKey.set(itemKey(it.productId, it.addons.map((a) => a.addonId)), {
      id: it.id, productId: it.productId, quantity: it.quantity,
    })
  }

  const newByKey = new Map<string, (typeof finalItems)[number]>()
  for (const it of finalItems) {
    const key = itemKey(it.productId, it.addonIds)
    const existing = newByKey.get(key)
    if (existing) {
      existing.quantity += it.quantity
      existing.totalPrice += it.totalPrice
    } else {
      newByKey.set(key, { ...it })
    }
  }

  // ── Validar estoque disponível para o INCREMENTO necessário ───────────
  for (const [key, newItem] of newByKey) {
    const old = oldByKey.get(key)
    const delta = newItem.quantity - (old?.quantity ?? 0)
    if (delta <= 0) continue
    const product = productMap.get(newItem.productId)!
    if (product.stocks.length > 0) {
      const totalStock = product.stocks.reduce((s, x) => s + Number(x.quantity), 0)
      if (totalStock < delta) {
        return NextResponse.json({
          error: `"${product.name}" tem apenas ${totalStock} unidade(s) disponível(is).`,
        }, { status: 422 })
      }
    }
  }

  const newSubtotal = [...newByKey.values()].reduce((s, i) => s + i.totalPrice, 0)
  const deliveryFee = Number(order.deliveryFee)
  const discountAmount = Number(order.discountAmount)
  const cashbackUsed = Number(order.cashbackUsed)
  const newTotal = Math.max(0, Math.round((newSubtotal + deliveryFee - discountAmount - cashbackUsed) * 100) / 100)

  const alreadyPaid = order.payments
    .filter((p) => p.status === 'PAID')
    .reduce((s, p) => s + Number(p.amount), 0)
  const pendingPayments = order.payments.filter((p) => p.status === 'PENDING')
  const pendingSum = pendingPayments.reduce((s, p) => s + Number(p.amount), 0)
  const shouldAdjustSinglePendingPayment =
    alreadyPaid === 0 &&
    pendingPayments.length === 1 &&
    Math.abs(pendingSum - Number(order.total)) < 0.01

  const affectedProductIds = new Set<string>()

  await prisma.$transaction(async (tx) => {
    // 1. Remover itens que não existem mais no novo carrinho (devolve estoque)
    for (const [key, old] of oldByKey) {
      if (newByKey.has(key)) continue
      await tx.orderItem.delete({ where: { id: old.id } }) // cascade remove os adicionais da linha
      const r = await restockOrderItems(tx, { tenantId, orderId, productId: old.productId, quantity: old.quantity })
      r.affectedProductIds.forEach((id) => affectedProductIds.add(id))
    }

    // 2. Itens novos ou com quantidade alterada
    for (const [key, newItem] of newByKey) {
      const old = oldByKey.get(key)

      if (!old) {
        await tx.orderItem.create({
          data: {
            orderId,
            productId: newItem.productId,
            productName: newItem.productName,
            productPrice: newItem.productPrice,
            quantity: newItem.quantity,
            unitPrice: newItem.unitPrice,
            totalPrice: newItem.totalPrice,
            notes: newItem.notes,
            addons: { create: newItem.addons },
          },
        })
        const r = await decrementStockForOrder(tx, {
          tenantId, orderId, items: [{ productId: newItem.productId, quantity: newItem.quantity }],
        })
        r.affectedProductIds.forEach((id) => affectedProductIds.add(id))
        continue
      }

      if (old.quantity === newItem.quantity) continue

      await tx.orderItem.update({
        where: { id: old.id },
        data: { quantity: newItem.quantity, totalPrice: newItem.totalPrice, notes: newItem.notes },
      })

      const delta = newItem.quantity - old.quantity
      if (delta > 0) {
        const r = await decrementStockForOrder(tx, {
          tenantId, orderId, items: [{ productId: newItem.productId, quantity: delta }],
        })
        r.affectedProductIds.forEach((id) => affectedProductIds.add(id))
      } else {
        const r = await restockOrderItems(tx, {
          tenantId, orderId, productId: newItem.productId, quantity: -delta,
        })
        r.affectedProductIds.forEach((id) => affectedProductIds.add(id))
      }
    }

    // 3. Atualizar totais do pedido
    await tx.order.update({
      where: { id: orderId },
      data: { subtotal: newSubtotal, total: newTotal },
    })

    // 4. Ajustar o único pagamento pendente (caso simples — ver comentário no topo do arquivo)
    if (shouldAdjustSinglePendingPayment) {
      await tx.payment.update({
        where: { id: pendingPayments[0].id },
        data: { amount: newTotal },
      })
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        status: order.status as any,
        userId: session.user.id,
        notes: `Pedido editado por ${session.user.name ?? session.user.email}: total de R$${Number(order.total).toFixed(2)} para R$${newTotal.toFixed(2)}`,
      },
    })
  })

  if (affectedProductIds.size > 0) {
    await revalidateStorefrontForTenant(tenantId)
  }

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.ORDER_ITEMS_EDITED,
    resource: 'orders',
    resourceId: orderId,
    oldValue: { total: Number(order.total), items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
    newValue: { total: newTotal, items: finalItems.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
  })

  try { await publishOrderEvent(tenantId, { type: 'ORDER_UPDATED', orderId, orderNumber: order.orderNumber, status: order.status }) } catch {}

  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { addons: { select: { addonId: true, addonName: true, addonPrice: true } } } },
      payments: {
        select: {
          id: true, method: true, status: true, amount: true,
          paidAt: true, changeAmount: true, pixExpiresAt: true, createdAt: true,
        },
      },
    },
  })

  return NextResponse.json({
    ok: true,
    subtotal: newSubtotal,
    total: newTotal,
    items: updated!.items.map((i) => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      totalPrice: Number(i.totalPrice),
      addons: i.addons.map((a) => ({ ...a, addonPrice: Number(a.addonPrice) })),
    })),
    payments: updated!.payments.map((p) => ({
      ...p,
      amount: Number(p.amount),
      changeAmount: p.changeAmount ? Number(p.changeAmount) : null,
    })),
  })
}
