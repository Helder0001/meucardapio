// app/api/whatsapp/chats/[chatId]/send/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { sendWhatsAppMessage } from '@/lib/messaging/evolution'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await params
  const { body } = await req.json()

  if (!body?.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  const chat = await prisma.whatsappChat.findFirst({
    where: { id: chatId, tenantId: session.user.tenantId },
  })
  if (!chat) return NextResponse.json({ error: 'Chat não encontrado' }, { status: 404 })

  // Send via Evolution API
  try {
    await sendWhatsAppMessage({
      tenantId: session.user.tenantId,
      phone: chat.phone,
      message: body.trim(),
    })
  } catch (err) {
    console.error('[whatsapp/send]', err)
    return NextResponse.json({ error: 'Falha ao enviar mensagem. Verifique se o WhatsApp está conectado.' }, { status: 500 })
  }

  // Save sent message
  const message = await prisma.whatsappMessage.create({
    data: {
      chatId: chat.id,
      tenantId: session.user.tenantId,
      body: body.trim(),
      fromMe: true,
      sentById: session.user.id,
      status: 'sent',
    },
    select: {
      id: true, body: true, fromMe: true, status: true, createdAt: true,
      sentBy: { select: { name: true } },
    },
  })

  // Update chat last message
  await prisma.whatsappChat.update({
    where: { id: chat.id },
    data: { lastMessage: body.trim(), lastMessageAt: new Date() },
  })

  return NextResponse.json({ message })
}
