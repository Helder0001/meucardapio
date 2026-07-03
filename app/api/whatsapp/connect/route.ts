// app/api/whatsapp/connect/route.ts
// Credenciais da Evolution API ficam em variáveis de ambiente (EVOLUTION_API_URL e EVOLUTION_API_KEY)
// O cliente NÃO envia URL nem API Key — só o tenantId (já vem da sessão)

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { getEvolutionWebhookSecret } from '@/lib/messaging/evolution'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!

export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!EVOLUTION_URL || !EVOLUTION_KEY) {
    console.error('[whatsapp/connect] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados')
    return NextResponse.json(
      { error: 'WhatsApp não configurado. Contate o suporte.' },
      { status: 503 }
    )
  }

  // Nome da instância é único por tenant
  const instanceName = `tenant_${session.user.tenantId}`

  try {
    // Tentar criar instância
    const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
      body: JSON.stringify({
        instanceName,
        qrcode:      true,
        integration: 'WHATSAPP-BAILEYS',
      }),
      signal: AbortSignal.timeout(10_000),
    })

    let qrCode:    string | null = null
    let connected: boolean       = false

    if (!createRes.ok) {
      // Instância já existe — tentar conectar
      const connectRes = await fetch(
        `${EVOLUTION_URL}/instance/connect/${instanceName}`,
        {
          headers: { apikey: EVOLUTION_KEY },
          signal:  AbortSignal.timeout(10_000),
        }
      )
      if (!connectRes.ok) {
        return NextResponse.json({ error: 'Não foi possível gerar o QR Code' }, { status: 400 })
      }
      const connectData = await connectRes.json()
      qrCode    = connectData?.base64?.replace('data:image/png;base64,', '') ?? null
      connected = connectData?.instance?.state === 'open'
    } else {
      const createData = await createRes.json()
      qrCode    = createData?.qrcode?.base64?.replace('data:image/png;base64,', '') ?? null
    }

    await prisma.whatsappConfig.upsert({
      where:  { tenantId: session.user.tenantId },
      update: {
        instanceName,
        status: connected ? 'CONNECTED' : 'CONNECTING',
        ...(connected ? { lastConnectedAt: new Date() } : {}),
      },
      create: {
        tenantId:       session.user.tenantId,
        evolutionUrl:   EVOLUTION_URL,        // salvo apenas para referência interna
        evolutionApiKey: '',                  // não armazena mais a key do cliente
        instanceName,
        status: connected ? 'CONNECTED' : 'CONNECTING',
      },
    })

    // Registrar a webhook na instância — sem isso a Evolution API nunca avisa
    // este servidor quando a conexão muda de estado (CONNECTION_UPDATE) ou quando
    // chegam mensagens (MESSAGES_UPSERT), e o status no banco nunca sai de CONNECTING.
    try {
      await fetch(`${EVOLUTION_URL}/webhook/set/${instanceName}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/evolution?secret=${getEvolutionWebhookSecret()}`,
            webhookByEvents: false,
            events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
          },
        }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (webhookErr) {
      console.error('[whatsapp/connect] Falha ao registrar webhook:', webhookErr)
    }

    return NextResponse.json({ qrCode, status: connected ? 'CONNECTED' : 'CONNECTING' })
  } catch (err) {
    console.error('[whatsapp/connect]', err)
    return NextResponse.json(
      { error: 'Erro ao conectar. Tente novamente.' },
      { status: 500 }
    )
  }
}
