// app/api/efi/pix-webhook-check/route.ts
//
// Diagnóstico: consulta DIRETO na Efí (GET /v2/webhook/:chave) qual URL de
// webhook está registrada agora pra chave Pix do tenant — em vez de
// confiar cegamente no retorno 200 de quando o webhook foi configurado
// (app/api/efi/connect/route.ts). Usado pra investigar Pix que "funciona"
// (gera QR code, cobrança criada) mas nunca confirma o pagamento — sintoma
// clássico de webhook não registrado de verdade, ou registrado pro
// ambiente/chave errados.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { decrypt } from '@/lib/security/crypto'
import { authorizePixApi, getPixWebhookConfig } from '@/lib/efi/tenant-pix-client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const connection = await prisma.efiConnection.findFirst({
    where: { tenantId: session.user.tenantId, revokedAt: null },
  })

  if (!connection || !connection.pixCertificateEnc || !connection.pixKey) {
    return NextResponse.json({ error: 'Pix da Efí não configurado para este estabelecimento' }, { status: 400 })
  }

  const clientId = decrypt(connection.clientIdEnc)
  const clientSecret = decrypt(connection.clientSecretEnc)
  const pfx = Buffer.from(decrypt(connection.pixCertificateEnc), 'base64')
  const passphrase = connection.pixCertificatePassphraseEnc ? decrypt(connection.pixCertificatePassphraseEnc) : ''
  const creds = { clientId, clientSecret, pfx, passphrase, sandbox: connection.sandbox }

  const auth_ = await authorizePixApi(creds)
  if (!auth_.ok) {
    return NextResponse.json({ error: `Falha ao autenticar na API Pix: ${auth_.error}` }, { status: 400 })
  }

  const expectedUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/efi-pix`

  try {
    const { webhookUrl, raw } = await getPixWebhookConfig({
      ...creds,
      accessToken: auth_.accessToken,
      pixKey: connection.pixKey,
    })

    return NextResponse.json({
      environment: connection.sandbox ? 'SANDBOX' : 'PRODUCTION',
      pixKey: connection.pixKey,
      registeredWebhookUrl: webhookUrl,
      expectedWebhookUrl: expectedUrl,
      matches: webhookUrl === expectedUrl,
      raw,
    })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
