// app/api/efi/connect/route.ts
//
// "Cadastro" da Efí (não é OAuth de verdade — a Efí não oferece isso pra
// plataformas terceiras). O tenant cola aqui o Client ID/Secret e o
// identificador de conta que ele mesmo gerou no painel da própria conta
// Efí dele. Opcionalmente, também envia o certificado .p12 + chave Pix
// pra habilitar cobrança via Pix (API separada, exige mTLS).

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { encrypt } from '@/lib/security/crypto'
import { validateEfiCredentials } from '@/lib/efi/tenant-client'
import { authorizePixApi, configurePixWebhook } from '@/lib/efi/tenant-pix-client'
import { auditLog } from '@/lib/utils/audit'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para gerenciar pagamentos' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
  const clientSecret = typeof body?.clientSecret === 'string' ? body.clientSecret.trim() : ''
  const accountIdentifier = typeof body?.accountIdentifier === 'string' ? body.accountIdentifier.trim() : null
  const sandbox = body?.sandbox !== false // default true (sandbox) se não vier explícito

  // Certificado do Pix (opcional — só quem quiser habilitar Pix via Efí
  // precisa preencher). Reaproveita o MESMO Client ID/Secret de cima: a
  // suposição é que o tenant usa uma única aplicação Efí com os dois
  // produtos (Cobranças + Pix) habilitados, o que é o caminho mais comum.
  const pixCertificateBase64 = typeof body?.pixCertificateBase64 === 'string' ? body.pixCertificateBase64.trim() : ''
  const pixCertificatePassphrase = typeof body?.pixCertificatePassphrase === 'string' ? body.pixCertificatePassphrase : ''
  const pixKey = typeof body?.pixKey === 'string' ? body.pixKey.trim() : ''

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Client ID e Client Secret são obrigatórios.' }, { status: 400 })
  }

  const validation = await validateEfiCredentials({ clientId, clientSecret, sandbox })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  let pixValidated = false
  let pfxBuffer: Buffer | null = null

  if (pixCertificateBase64 || pixKey) {
    if (!pixCertificateBase64 || !pixKey) {
      return NextResponse.json(
        { error: 'Para habilitar Pix, envie o certificado .p12 e a chave Pix juntos.' },
        { status: 400 }
      )
    }

    try {
      pfxBuffer = Buffer.from(pixCertificateBase64, 'base64')
    } catch {
      return NextResponse.json({ error: 'Certificado .p12 inválido — verifique o arquivo enviado.' }, { status: 400 })
    }

    const pixAuth = await authorizePixApi({
      clientId,
      clientSecret,
      pfx: pfxBuffer,
      passphrase: pixCertificatePassphrase,
      sandbox,
    })
    if (!pixAuth.ok) {
      return NextResponse.json({ error: pixAuth.error }, { status: 400 })
    }

    // Registra o webhook da chave Pix pra receber confirmação de pagamento
    // automaticamente. Se isso falhar, ainda deixamos salvar as
    // credenciais (o tenant pode reconfigurar o webhook depois), mas
    // avisamos no log pra investigar.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl) {
      try {
        await configurePixWebhook({
          clientId,
          clientSecret,
          pfx: pfxBuffer,
          passphrase: pixCertificatePassphrase,
          sandbox,
          accessToken: pixAuth.accessToken,
          pixKey,
          webhookUrl: `${appUrl}/api/webhooks/efi-pix`,
        })
      } catch (err) {
        console.error('[efi/connect] falha ao configurar webhook do Pix (credenciais salvas mesmo assim):', err)
      }
    }

    pixValidated = true
  }

  const tenantId = session.user.tenantId

  const data = {
    clientIdEnc: encrypt(clientId),
    clientSecretEnc: encrypt(clientSecret),
    accountIdentifier,
    sandbox,
    connectedAt: new Date(),
    connectedByUserId: session.user.id,
    revokedAt: null,
    ...(pixValidated && pfxBuffer
      ? {
          pixCertificateEnc: encrypt(pfxBuffer.toString('base64')),
          pixCertificatePassphraseEnc: encrypt(pixCertificatePassphrase),
          pixKey,
        }
      : {}),
  }

  await prisma.efiConnection.upsert({
    where: { tenantId },
    update: data,
    create: { tenantId, ...data },
  })

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: 'EFI_CONNECTED',
    resource: 'efiConnection',
    metadata: { sandbox, pixEnabled: pixValidated },
  })

  return NextResponse.json({ ok: true, pixEnabled: pixValidated })
}
