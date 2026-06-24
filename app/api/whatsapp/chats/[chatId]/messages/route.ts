// app/api/whatsapp/chats/[chatId]/messages/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await params

  try {
    const chat = await (prisma as any).whatsappChat.findFirst({
      where: { id: chatId, tenantId: session.user.tenantId },
      select: { id: true, phone: true, contactName: true, unreadCount: true },
    })
    if (!chat) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await (prisma as any).whatsappChat.update({
      where: { id: chatId },
      data: { unreadCount: 0 },
    })

    const messages = await (prisma as any).whatsappMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true, body: true, fromMe: true, status: true, createdAt: true,
        sentBy: { select: { name: true } },
      },
    })

    return NextResponse.json({ chat, messages })
  } catch (err: any) {
    if (err?.message?.includes('does not exist')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('[whatsapp/messages]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
