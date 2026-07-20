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
  payerPhone: string // só dígitos, com DDD — obrigatório pela Efí (customer.phone_number)
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
            phone_number: params.payerPhone,
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

interface TenantPaymentLinkParams {
  tenantId: string
  orderId: string
  amount: number // em reais
  description: string
  expireAt?: string // 'YYYY-MM-DD', padrão: Efí usa um prazo default se omitido
}

interface TenantPaymentLinkResult {
  chargeId: number
  paymentUrl: string
}

/**
 * Gera um "Link de Pagamento" da Efí (POST /v1/charge/one-step/link) —
 * cria a cobrança e devolve uma URL hospedada pela própria Efí, pro
 * cliente escolher e inserir os dados do cartão sem sair do link (nada de
 * formulário nosso). Diferente de createTenantCardCharge acima, que já
 * exige o payment_token (checkout embutido no nosso form).
 *
 * Só oferecemos "credit_card" aqui (não "all"/boleto): pedido de
 * restaurante é same-day, boleto demora dias pra compensar — não faz
 * sentido pro caso de uso. Pix não é opção nesse produto específico da
 * Efí (Link de Pagamento só cobre boleto/cartão); pra Pix já temos a
 * cobrança direta em lib/efi/tenant-pix-client.ts.
 */
export async function createEfiPaymentLink(params: TenantPaymentLinkParams): Promise<TenantPaymentLinkResult> {
  const connection = await prisma.efiConnection.findFirst({
    where: { tenantId: params.tenantId, revokedAt: null },
  })
  if (!connection) {
    throw new Error('Efí não configurado para este estabelecimento')
  }

  const clientId = decrypt(connection.clientIdEnc)
  const clientSecret = decrypt(connection.clientSecretEnc)

  const response = await efiRequestWithCredentials<{
    data: { charge_id: number; payment_url: string }
  }>(
    { clientId, clientSecret, sandbox: connection.sandbox },
    'POST',
    '/v1/charge/one-step/link',
    {
      items: [
        {
          name: params.description.slice(0, 250),
          value: Math.round(params.amount * 100),
          amount: 1,
        },
      ],
      settings: {
        payment_method: 'credit_card',
        ...(params.expireAt ? { expire_at: params.expireAt } : {}),
      },
    }
  )

  return {
    chargeId: response.data.charge_id,
    paymentUrl: response.data.payment_url,
  }
}
