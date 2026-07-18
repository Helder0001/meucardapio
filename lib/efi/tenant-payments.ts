// lib/efi/tenant-payments.ts
//
// Cobrança avulsa de CARTÃO pra pedidos dos tenants via Efí — usa a API
// de Cobranças (mesma da assinatura da plataforma, SEM certificado mTLS,
// diferente da API Pix). O payment_token vem do Efí.js no navegador do
// cliente, exatamente como já funciona em app/(auth)/register/register-form.tsx
// e app/assinatura/subscription-card-form.tsx.

import { prisma } from '@/lib/db/client'
import { decrypt } from '@/lib/security/crypto'
import { efiRequestWithCredentials } from './tenant-client'

interface TenantCardChargeParams {
  tenantId: string
  orderId: string
  amount: number // em reais
  paymentToken: string
  payerCpf: string
  payerName: string
  payerEmail: string
  description: string
}

interface TenantCardChargeResult {
  chargeId: number
  status: string // 'approved' | 'unpaid' | ...
  cardMask?: string
}

export async function createTenantCardCharge(params: TenantCardChargeParams): Promise<TenantCardChargeResult> {
  const connection = await prisma.efiConnection.findFirst({
    where: { tenantId: params.tenantId, revokedAt: null },
  })
  if (!connection) {
    throw new Error('Efí não configurado para este estabelecimento')
  }

  const clientId = decrypt(connection.clientIdEnc)
  const clientSecret = decrypt(connection.clientSecretEnc)

  const response = await efiRequestWithCredentials<{
    data: {
      charge_id: number
      status: string
      payment: { credit_card?: { mask?: string } }
    }
  }>(
    { clientId, clientSecret, sandbox: connection.sandbox },
    'POST',
    '/v1/charge/one-step',
    {
      items: [
        {
          name: params.description.slice(0, 250),
          value: Math.round(params.amount * 100),
          amount: 1,
        },
      ],
      payment: {
        credit_card: {
          customer: {
            name: params.payerName,
            cpf: params.payerCpf,
            email: params.payerEmail,
          },
          payment_token: params.paymentToken,
          installments: 1,
        },
      },
    }
  )

  return {
    chargeId: response.data.charge_id,
    status: response.data.status,
    cardMask: response.data.payment?.credit_card?.mask,
  }
}
