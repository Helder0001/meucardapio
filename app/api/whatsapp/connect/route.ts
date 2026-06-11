// app/api/whatsapp/connect/route.ts
// VULN-02 CORRIGIDO: API Key agora criptografada com AES-256-GCM (não mais base64)

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { encrypt } from '@/lib/security/crypto'
import { z } from 'zod'

const schema = z.object({
  evolutionUrl: z.string().url(),
  apiKey:       z.string().min(1),
  instanceName: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Nome inválido'),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { evolutionUrl, apiKey, instanceName } = parsed.data
  const tenantId = session.user.tenantId

  try {
    // Tentar criar/conectar instância
    const createRes = await fetch(`${evolutionUrl}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({
        instanceName,
        qrcode:      true,
        integration: 'WHATSAPP-BAILEYS',
      }),
      signal: AbortSignal.timeout(10_000), // timeout 10s
    })

    let qrCode:    string | null = null
    let connected: boolean       = false

    if (!createRes.ok) {
      // Instância pode já existir — tentar conectar
      const connectRes = await fetch(
        `${evolutionUrl}/instance/connect/${instanceName}`,
        {
          headers: { apikey: apiKey },
          signal:  AbortSignal.timeout(10_000),
        }
      )
      if (!connectRes.ok) {
        return NextResponse.json({ error: 'Não foi possível conectar à instância' }, { status: 400 })
      }
      const connectData = await connectRes.json()
      qrCode    = connectData?.base64?.replace('data:image/png;base64,', '') ?? null
      connected = connectData?.instance?.state === 'open'
    } else {
      const createData = await createRes.json()
      qrCode    = createData?.qrcode?.base64?.replace('data:image/png;base64,', '') ?? null
    }

    // VULN-02 CORRIGIDO: criptografar com AES-256-GCM, não base64
    const encryptedApiKey = encrypt(apiKey)

    await prisma.whatsappConfig.upsert({
      where:  { tenantId },
      update: {
        evolutionUrl,
        evolutionApiKey: encryptedApiKey,
        instanceName,
        status:          connected ? 'CONNECTED' : 'CONNECTING',
        ...(connected ? { lastConnectedAt: new Date() } : {}),
      },
      create: {
        tenantId,
        evolutionUrl,
        evolutionApiKey: encryptedApiKey,
        instanceName,
        status:          connected ? 'CONNECTED' : 'CONNECTING',
      },
    })

    return NextResponse.json({ qrCode, status: connected ? 'CONNECTED' : 'CONNECTING' })
  } catch (err) {
    // VULN-12 CORRIGIDO: não expor stacktrace
    console.error('[whatsapp/connect]', err)
    return NextResponse.json(
      { error: 'Erro ao conectar. Verifique a URL e a API Key.' },
      { status: 500 }
    )
  }
}
