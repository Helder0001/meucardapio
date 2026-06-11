// app/api/whatsapp/status/route.ts
// VULN-02 CORRIGIDO: decrypt com AES-256-GCM

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { decrypt } from '@/lib/security/crypto'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.whatsappConfig.findFirst({
    where: { tenantId: session.user.tenantId },
    select: {
      evolutionUrl:    true,
      evolutionApiKey: true,
      instanceName:    true,
      status:          true,
    },
  })

  if (!config) return NextResponse.json({ status: 'DISCONNECTED' })

  try {
    // VULN-02 CORRIGIDO: usar decrypt() real
    const apiKey  = decrypt(config.evolutionApiKey)
    const res     = await fetch(
      `${config.evolutionUrl}/instance/connectionState/${config.instanceName}`,
      {
        headers: { apikey: apiKey },
        signal:  AbortSignal.timeout(8_000),
      }
    )

    if (!res.ok) return NextResponse.json({ status: 'DISCONNECTED' })

    const data      = await res.json()
    const connected = data?.instance?.state === 'open'
    const newStatus = connected ? 'CONNECTED' : 'DISCONNECTED'

    if (newStatus !== config.status) {
      await prisma.whatsappConfig.update({
        where: { tenantId: session.user.tenantId },
        data:  {
          status: newStatus,
          ...(connected ? { lastConnectedAt: new Date() } : {}),
        },
      })
    }

    return NextResponse.json({ status: newStatus })
  } catch {
    return NextResponse.json({ status: 'DISCONNECTED' })
  }
}
