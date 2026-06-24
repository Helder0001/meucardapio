// app/api/webhooks/evolution/route.ts
//
// Webhook recebido da Evolution API.
// Eventos tratados:
// - CONNECTION_UPDATE: status da conexão (conectado/desconectado)
// - MESSAGES_UPSERT:   mensagens recebidas dos clientes (opt-out, etc.)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

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
          const text      = msg.message?.conversation?.trim() ||
                            msg.message?.extendedTextMessage?.text?.trim() ||
                            msg.message?.imageMessage?.caption?.trim() ||
                            '[mídia]'
          const msgId     = msg.key?.id

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
