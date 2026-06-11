// app/api/whatsapp/disconnect/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.whatsappConfig.findFirst({
    where: { tenantId: session.user.tenantId },
  })

  if (config) {
    try {
      const apiKey = Buffer.from(config.evolutionApiKey, 'base64').toString('utf8')
      await fetch(`${config.evolutionUrl}/instance/logout/${config.instanceName}`, {
        method: 'DELETE',
        headers: { apikey: apiKey },
      })
    } catch {
      // Ignorar erro — desconectar localmente mesmo assim
    }

    await prisma.whatsappConfig.update({
      where: { tenantId: session.user.tenantId },
      data: { status: 'DISCONNECTED' },
    })
  }

  return NextResponse.json({ ok: true })
}
