// app/api/customers/[id]/route.ts
//
// Detalhe do cliente pro painel do dashboard: informações + estatísticas
// por período (semana/quinzena/mês/total) + tags automáticas + histórico
// de pedidos. Também permite editar (nome/telefone/endereço) e remover
// (anonimização LGPD — nunca DELETE de verdade, porque os pedidos antigos
// referenciam o customerId e precisam continuar existindo).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

const ORDER_TYPE_LABEL: Record<string, string> = {
  DELIVERY: 'Delivery',
  PICKUP: 'Retirada',
  TABLE: 'Mesa',
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfMonth() {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const tenantId = session.user.tenantId

  const customer = await prisma.customer.findFirst({
    where: { id, tenantId },
  })

  if (!customer) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  // Todo o histórico de pedidos do cliente — usado tanto pra montar a
  // lista exibida quanto pra calcular as estatísticas por período (mais
  // simples e barato do que 4 queries agregadas separadas).
  const orders = await prisma.order.findMany({
    where: { customerId: customer.id, tenantId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      orderNumber: true,
      type: true,
      status: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
    },
  })

  // "Concluído" = entregue/retirado com sucesso — mesmo critério usado
  // pelas estatísticas cumulativas do Customer (totalOrders/totalSpent).
  const completed = orders.filter((o) => o.status === 'DELIVERED')

  const week = daysAgo(7)
  const fortnight = daysAgo(15)
  const month = startOfMonth()

  const sumIn = (since: Date) =>
    completed
      .filter((o) => o.createdAt >= since)
      .reduce((acc, o) => ({ count: acc.count + 1, total: acc.total + Number(o.total) }), { count: 0, total: 0 })

  const stats = {
    week: sumIn(week),
    fortnight: sumIn(fortnight),
    month: sumIn(month),
    total: completed.reduce((acc, o) => ({ count: acc.count + 1, total: acc.total + Number(o.total) }), { count: 0, total: 0 }),
  }

  // Tags automáticas — sinais rápidos pra quem está olhando o cliente.
  const tags: Array<{ key: string; label: string; description: string }> = []
  const daysSinceCreated = Math.floor((Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24))
  if (daysSinceCreated < 15) {
    tags.push({ key: 'new', label: 'Cliente Novo', description: 'Cadastrado há menos de 15 dias.' })
  }
  if (customer.totalOrders >= 5) {
    tags.push({ key: 'loyal', label: 'Cliente Fiel', description: `Já fez ${customer.totalOrders} pedidos.` })
  }
  if (customer.lastOrderAt && Date.now() - customer.lastOrderAt.getTime() > 60 * 24 * 60 * 60 * 1000) {
    tags.push({ key: 'inactive', label: 'Inativo', description: 'Sem pedidos há mais de 60 dias.' })
  }

  // Endereço: o Customer só guarda um endereço "padrão" quando o próprio
  // cliente cadastra (checkout do cardápio digital) — quando ele foi
  // criado só pelo PDV/balcão, isso fica vazio. Nesse caso, usa o
  // endereço de entrega do pedido mais recente como melhor palpite.
  const addressFromCustomer = (customer.address as { address?: string } | null)?.address ?? null
  const lastDeliveryOrder = await prisma.order.findFirst({
    where: { customerId: customer.id, tenantId, deliveryAddress: { not: Prisma.DbNull } },
    orderBy: { createdAt: 'desc' },
    select: { deliveryAddress: true, deliveryBairro: true },
  })
  const addressFromOrder = (lastDeliveryOrder?.deliveryAddress as { address?: string } | null)?.address ?? null

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: addressFromCustomer ?? addressFromOrder,
      isVerified: customer.isVerified,
      createdAt: customer.createdAt,
      loyaltyPoints: customer.loyaltyPoints,
      cashbackBalance: Number(customer.cashbackBalance),
    },
    stats,
    tags,
    history: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      typeLabel: ORDER_TYPE_LABEL[o.type] ?? o.type,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: Number(o.total),
      createdAt: o.createdAt,
    })),
  })
}

const editSchema = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(8).max(20).optional(),
  address: z.string().trim().max(300).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const allowedRoles = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'MASTER_ADMIN', 'STAFF']
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const tenantId = session.user.tenantId

  const customer = await prisma.customer.findFirst({ where: { id, tenantId } })
  if (!customer) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  let body: unknown = {}
  try { body = await request.json() } catch {}
  const parsed = editSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  if (parsed.data.phone && parsed.data.phone !== customer.phone) {
    const clash = await prisma.customer.findFirst({
      where: { tenantId, phone: parsed.data.phone, id: { not: customer.id } },
    })
    if (clash) {
      return NextResponse.json({ error: 'Já existe outro cliente com esse telefone' }, { status: 409 })
    }
  }

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name || null } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.address !== undefined
        ? { address: parsed.data.address ? { address: parsed.data.address } : Prisma.DbNull }
        : {}),
    },
  })

  return NextResponse.json({ ok: true, id: updated.id })
}

// "Remover" cliente — anonimização LGPD, não exclusão de verdade. Os
// pedidos antigos ficam intactos (customerId continua apontando pra esse
// registro), só que sem dado pessoal identificável.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const allowedRoles = ['TENANT_ADMIN', 'MANAGER', 'MASTER_ADMIN']
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const tenantId = session.user.tenantId

  const customer = await prisma.customer.findFirst({ where: { id, tenantId } })
  if (!customer) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      name: null,
      email: null,
      cpf: null,
      address: Prisma.DbNull,
      phone: `anon-${customer.id}`,
      isActive: false,
      anonymizedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}
