// app/api/whatsapp/chats/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const chats = await prisma.whatsappChat.findMany({
      where: { tenantId: session.user.tenantId },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      select: {
        id: true, phone: true, contactName: true,
        lastMessage: true, lastMessageAt: true, unreadCount: true, isOpen: true,
      },
    })
    return NextResponse.json({ chats })
  } catch (err: any) {
    // Tabela ainda não existe no banco (migration pendente) — retorna lista vazia
    if (err?.message?.includes('does not exist')) {
      return NextResponse.json({ chats: [] })
    }
    console.error('[whatsapp/chats]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
