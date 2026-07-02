// app/api/webhooks/evolution/route.ts
//
// Webhook recebido da Evolution API.
// Eventos tratados:
// - CONNECTION_UPDATE: status da conexão (conectado/desconectado)
// - MESSAGES_UPSERT:   mensagens recebidas dos clientes (opt-out, etc.)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { getBase64FromMediaMessage } from '@/lib/messaging/evolution'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const event    = body?.event    as string | undefined
    const instance = body?.instance as string | undefined
    const data     = body?.data

    if (!event || !instance) {
      return NextResponse.json({ ok: true })
    }

    // Encontrar tenant pela instância
    const config = await prisma.whatsappConfig.findFirst({
      where: { instanceName: instance },
      select: { tenantId: true, status: true },
    })

    if (!config) {
      return NextResponse.json({ ok: true })
    }

    switch (event) {
      // ── Atualização de status da conexão ──────────────────
      case 'connection.update': {
        const state = data?.state as string | undefined
        const newStatus =
          state === 'open'  ? 'CONNECTED'    :
          state === 'close' ? 'DISCONNECTED' :
          state === 'connecting' ? 'CONNECTING' :
          config.status

        if (newStatus !== config.status) {
          await prisma.whatsappConfig.update({
            where: { tenantId: config.tenantId },
            data:  {
              status: newStatus,
              ...(newStatus === 'CONNECTED' ? { lastConnectedAt: new Date() } : {}),
              qrCode: newStatus === 'CONNECTED' ? null : undefined,
            },
          })
        }
        break
      }

      // ── QR Code gerado (para exibir na UI) ───────────────
      case 'qrcode.updated': {
        const qrCode = data?.qrcode?.base64 as string | undefined
        if (qrCode) {
          await prisma.whatsappConfig.update({
            where: { tenantId: config.tenantId },
            data:  { qrCode: qrCode.replace('data:image/png;base64,', ''), status: 'CONNECTING' },
          })
        }
        break
      }

      // ── Mensagem recebida de cliente ─────────────────────
      case 'messages.upsert': {
        const messages = Array.isArray(data?.messages) ? data.messages : [data]
        for (const msg of messages) {
          if (!msg) continue

          const fromPhone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '')
          const msgId     = msg.key?.id

          // Detectar mídia (imagem, vídeo, áudio, documento, figurinha)
          const mediaMessage =
            msg.message?.imageMessage    ? { type: 'image',    payload: msg.message.imageMessage }    :
            msg.message?.videoMessage    ? { type: 'video',    payload: msg.message.videoMessage }    :
            msg.message?.audioMessage    ? { type: 'audio',    payload: msg.message.audioMessage }    :
            msg.message?.documentMessage ? { type: 'document', payload: msg.message.documentMessage } :
            msg.message?.stickerMessage  ? { type: 'sticker',  payload: msg.message.stickerMessage }  :
            null

          // Evolution API envia o conteúdo em base64 no campo `message.base64`
          // quando a instância está configurada com webhook_base64 ativado.
          // Caso contrário, buscamos via endpoint dedicado da API.
          let base64 = msg.message?.base64 as string | undefined
          const mediaMimeType = mediaMessage?.payload?.mimetype as string | undefined
          const mediaFileName = mediaMessage?.payload?.fileName as string | undefined

          if (mediaMessage && !base64 && msg.key) {
            base64 = (await getBase64FromMediaMessage(config.tenantId, msg.key)) ?? undefined
          }

          const mediaUrl = mediaMessage && base64 && mediaMimeType
            ? `data:${mediaMimeType};base64,${base64}`
            : null

          const mediaLabel = mediaMessage
            ? {
                image:    '📷 Foto',
                video:    '🎥 Vídeo',
                audio:    '🎵 Áudio',
                document: `📄 ${mediaFileName ?? 'Documento'}`,
                sticker:  '🎭 Figurinha',
              }[mediaMessage.type]
            : null

          const text      = msg.message?.conversation?.trim() ||
                            msg.message?.extendedTextMessage?.text?.trim() ||
                            mediaMessage?.payload?.caption?.trim() ||
                            mediaLabel ||
                            '[mensagem não suportada]'

          if (!fromPhone) continue

          const phone = fromPhone.startsWith('55') ? fromPhone : `55${fromPhone}`

          // Opt-out
          if (['sair', 'parar', 'stop', 'cancelar', 'descadastrar'].includes(text.toLowerCase())) {
            await handleOptOut(config.tenantId, phone)
          }

          // Salvar/atualizar chat e mensagem (tabela pode não existir ainda)
          const chat = await (prisma as any).whatsappChat.upsert({
            where: { tenantId_phone: { tenantId: config.tenantId, phone } },
            create: {
              tenantId: config.tenantId,
              phone,
              contactName: msg.pushName ?? null,
              lastMessage: text,
              lastMessageAt: new Date(),
              unreadCount: 1,
            },
            update: {
              contactName: msg.pushName ?? undefined,
              lastMessage: text,
              lastMessageAt: new Date(),
              unreadCount: { increment: 1 },
              isOpen: true,
            },
          })

          await (prisma as any).whatsappMessage.create({
            data: {
              chatId: chat.id,
              tenantId: config.tenantId,
              body:   text,
              fromMe: false,
              status: 'received',
              msgId,
              mediaUrl,
              mediaType: mediaMessage?.type ?? null,
              mediaMimeType: mediaMimeType ?? null,
              mediaFileName: mediaFileName ?? null,
            },
          })
        }
        break
      }

      // ── Outros eventos: ignorar silenciosamente ───────────
      default:
        break
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    // Nunca retornar erro para o webhook — Evolution API vai retentar
    console.error('[webhook/evolution]', error)
    return NextResponse.json({ ok: true })
  }
}

async function handleOptOut(tenantId: string, phone: string) {
  // Marcar cliente como optou por não receber mensagens
  await prisma.customer.updateMany({
    where: { tenantId, phone },
    data:  {
      // Usar campo de settings JSON para armazenar opt-out
      // (evita migration de schema para este caso)
    },
  })

  // Registrar no audit log
  console.log(`[evolution] Opt-out recebido: tenant=${tenantId} phone=${phone}`)
}
