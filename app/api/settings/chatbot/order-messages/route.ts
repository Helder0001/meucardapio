// app/api/settings/chatbot/order-messages/route.ts
//
// CRUD dos templates de mensagem automática por status do pedido
// (Pedido Confirmado, Em Preparo, Pronto, Saiu para Entrega, Entregue,
// Cancelado). Quando não customizado, o sistema usa o texto padrão
// embutido em lib/messaging/evolution.ts.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { z } from 'zod'

const EVENTS = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const

const schema = z.object({
  messages: z.array(z.object({
    event: z.enum(EVENTS),
    active: z.boolean(),
    message: z.string().min(1).max(1500),
  })).max(EVENTS.length),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const rows = await (prisma as any).orderStatusMessage.findMany({
      where: { tenantId: session.user.tenantId },
    })
    return NextResponse.json({ messages: rows })
  } catch (err: any) {
    if (err?.message?.includes('does not exist')) {
      return NextResponse.json({ messages: [] })
    }
    console.error('[settings/chatbot/order-messages GET]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const tenantId = session.user.tenantId

  try {
    await prisma.$transaction(
      parsed.data.messages.map((m) =>
        (prisma as any).orderStatusMessage.upsert({
          where: { tenantId_event: { tenantId, event: m.event } },
          create: { tenantId, event: m.event, active: m.active, message: m.message },
          update: { active: m.active, message: m.message },
        })
      )
    )
    const rows = await (prisma as any).orderStatusMessage.findMany({ where: { tenantId } })
    return NextResponse.json({ messages: rows })
  } catch (err: any) {
    if (err?.message?.includes('does not exist')) {
      return NextResponse.json(
        { error: 'Tabela OrderStatusMessage ainda não existe no banco. Rode a migration antes de salvar.' },
        { status: 500 }
      )
    }
    console.error('[settings/chatbot/order-messages PUT]', err)
    return NextResponse.json({ error: 'Erro ao salvar mensagens' }, { status: 500 })
  }
}
