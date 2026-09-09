// app/api/orders/pending-count/route.ts
//
// CORREÇÃO (#4): o sininho de notificações (components/dashboard/header.tsx)
// chamava `/api/orders/kanban` esperando um JSON comum com
// `{ PENDING: [...], CONFIRMED: [...] }` — mas essa rota é, na verdade, uma
// stream SSE (Server-Sent Events, `text/event-stream`), não um JSON único.
// `fetch(...).json()` nunca conseguia interpretar a resposta, falhava
// silenciosamente (dentro de um catch vazio) e a contagem ficava sempre em
// 0 — por isso o sininho mostrava "Nenhuma notificação" mesmo com pedidos
// pendentes na tela do Kanban ao lado.
//
// Esta rota é um JSON simples e rápido (só um count no banco), pensada
// especificamente pra esse badge — não serve pra atualizar a lista do
// Kanban em si (isso continua sendo papel da stream).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pending = await prisma.order.count({
    where: {
      tenantId: session.user.tenantId,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
  })

  return NextResponse.json({ pending })
}
