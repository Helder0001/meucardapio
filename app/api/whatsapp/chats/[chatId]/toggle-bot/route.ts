// app/api/whatsapp/chats/[chatId]/toggle-bot/route.ts
//
// Liga/desliga o robô de atendimento para UMA conversa específica.
// Usado no botão "Reativar robô" / "Pausar robô" do WhatsApp Chat, quando
// o operador termina de atender manualmente e quer devolver a conversa
// pro automático (ou o contrário, se quiser assumir sem esperar o cliente
// pedir "falar com atendente").

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({ active: z.boolean() })

export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { chatId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })

  const chat = await prisma.whatsappChat.findFirst({
    where: { id: chatId, tenantId: session.user.tenantId },
  })
  if (!chat) return NextResponse.json({ error: 'Chat não encontrado' }, { status: 404 })

  const { active } = parsed.data

  const updated = await (prisma as any).whatsappChat.update({
    where: { id: chatId },
    data: active
      // Reativar: volta pro fluxo automático a partir da tela de opções —
      // não reenvia a saudação de novo, só passa a responder de novo.
      ? { botActive: true, awaitingAttendant: false, botState: 'MENU_SENT', botFallbackCount: 0 }
      // Pausar manualmente: operador assume o controle sem esperar o
      // cliente pedir atendente.
      : { botActive: false, awaitingAttendant: false },
    select: { id: true, botActive: true, awaitingAttendant: true },
  })

  return NextResponse.json({ chat: updated })
}
