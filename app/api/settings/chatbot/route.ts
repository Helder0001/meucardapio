// app/api/settings/chatbot/route.ts
//
// CRUD das configurações gerais do robô de atendimento (Automações do Chat).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { DEFAULT_CHATBOT_SETTINGS } from '@/lib/messaging/chatbot-engine'
import { z } from 'zod'

const schema = z.object({
  enabled: z.boolean(),

  welcomeActive: z.boolean(),
  welcomeMode: z.enum(['ALWAYS', 'NEW_CUSTOMERS_ONLY']),
  welcomeMessage: z.string().min(1).max(1000),

  menuAutoSendActive: z.boolean(),
  menuAutoSendMessage: z.string().min(1).max(1000),

  optionsMessage: z.string().min(1).max(1000),

  fallbackActive: z.boolean(),
  fallbackMessage: z.string().min(1).max(1000),

  attendantMessage: z.string().min(1).max(1000),
  blockAutoTransferToAttendant: z.boolean(),

  closingCommandActive: z.boolean(),
  closingKeyword: z.string().min(1).max(30),
  closingMessage: z.string().min(1).max(1000),

  outOfHoursActive: z.boolean(),
  outOfHoursMessage: z.string().min(1).max(1000),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const row = await (prisma as any).chatbotSettings.findUnique({
      where: { tenantId: session.user.tenantId },
    })
    return NextResponse.json({ settings: row ?? DEFAULT_CHATBOT_SETTINGS })
  } catch (err: any) {
    if (err?.message?.includes('does not exist')) {
      return NextResponse.json({ settings: DEFAULT_CHATBOT_SETTINGS })
    }
    console.error('[settings/chatbot GET]', err)
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
    const saved = await (prisma as any).chatbotSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...parsed.data },
      update: parsed.data,
    })
    return NextResponse.json({ settings: saved })
  } catch (err: any) {
    if (err?.message?.includes('does not exist')) {
      return NextResponse.json(
        { error: 'Tabela do robô ainda não existe no banco. Rode a migration ChatbotSettings antes de salvar.' },
        { status: 500 }
      )
    }
    console.error('[settings/chatbot PUT]', err)
    return NextResponse.json({ error: 'Erro ao salvar configurações' }, { status: 500 })
  }
}
