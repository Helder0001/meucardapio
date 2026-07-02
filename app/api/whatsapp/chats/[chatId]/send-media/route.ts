// app/api/whatsapp/chats/[chatId]/send-media/route.ts
// Envia um arquivo (imagem, vídeo, áudio ou documento) anexado pelo
// lojista no WhatsApp Chat do dashboard.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { sendWhatsAppMedia } from '@/lib/messaging/evolution'

const MAX_MB = 16
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/pdf']

function detectMediaType(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'document'
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await params

  const formData = await req.formData().catch(() => null)
  const file    = formData?.get('file') as File | null
  const caption = (formData?.get('caption') as string | null)?.trim() || undefined

  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `Arquivo muito grande. Máximo ${MAX_MB}MB.` }, { status: 413 })
  }
  if (!ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
    return NextResponse.json({ error: 'Tipo de arquivo não suportado' }, { status: 400 })
  }

  const chat = await prisma.whatsappChat.findFirst({
    where: { id: chatId, tenantId: session.user.tenantId },
  })
  if (!chat) return NextResponse.json({ error: 'Chat não encontrado' }, { status: 404 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')
  const mediaType = detectMediaType(file.type)

  try {
    const result = await sendWhatsAppMedia({
      tenantId: session.user.tenantId,
      phone:    chat.phone,
      base64,
      mediaType,
      mimeType: file.type,
      fileName: file.name,
      caption,
    })
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
  } catch (err) {
    console.error('[whatsapp/send-media]', err)
    return NextResponse.json({ error: 'Falha ao enviar arquivo. Verifique se o WhatsApp está conectado.' }, { status: 500 })
  }

  const dataUrl = `data:${file.type};base64,${base64}`

  const message = await (prisma as any).whatsappMessage.create({
    data: {
      chatId: chat.id,
      tenantId: session.user.tenantId,
      body: caption ?? (mediaType === 'image' ? '📷 Foto' : mediaType === 'video' ? '🎥 Vídeo' : mediaType === 'audio' ? '🎵 Áudio' : `📄 ${file.name}`),
      fromMe: true,
      sentById: session.user.id,
      status: 'sent',
      mediaUrl: dataUrl,
      mediaType,
      mediaMimeType: file.type,
      mediaFileName: file.name,
    },
    select: {
      id: true, body: true, fromMe: true, status: true, createdAt: true,
      mediaUrl: true, mediaType: true, mediaMimeType: true, mediaFileName: true,
      sentBy: { select: { name: true } },
    },
  })

  await prisma.whatsappChat.update({
    where: { id: chat.id },
    data: { lastMessage: message.body, lastMessageAt: new Date() },
  })

  return NextResponse.json({ message })
}
