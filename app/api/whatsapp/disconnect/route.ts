// app/api/whatsapp/disconnect/route.ts
// Credenciais da Evolution API ficam em variáveis de ambiente

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!

export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.whatsappConfig.findFirst({
    where:  { tenantId: session.user.tenantId },
    select: { instanceName: true },
  })

  if (config && EVOLUTION_URL && EVOLUTION_KEY) {
    try {
      await fetch(`${EVOLUTION_URL}/instance/logout/${config.instanceName}`, {
        method:  'DELETE',
        headers: { apikey: EVOLUTION_KEY },
      })
    } catch {
      // Ignorar erro — desconectar localmente mesmo assim
    }
  }

  await prisma.whatsappConfig.update({
    where: { tenantId: session.user.tenantId },
    data:  { status: 'DISCONNECTED' },
  })

  return NextResponse.json({ ok: true })
}
