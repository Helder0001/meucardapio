// lib/payments/provider-router.ts
//
// Ponto único que decide qual provedor (Mercado Pago, Stripe ou Efí)
// processa o Pix ou o Cartão de um tenant. Lê de tenant.settings.paymentProviders
// (definido via actions/settings/save-payment-settings.ts:setPaymentProvider).
//
// Default sempre MERCADOPAGO — se o tenant nunca escolheu nada, ou
// escolheu um provedor que não está mais conectado, cai em MP (que por
// sua vez já falha com erro claro se o tenant também não tiver MP
// conectado — ver lib/mercadopago/resolve-token.ts).

import { prisma } from '@/lib/db/client'

export type PaymentProviderChoice = 'MERCADOPAGO' | 'STRIPE' | 'EFI' | 'ASAAS'

export async function getPaymentProvider(
  tenantId: string,
  method: 'pix' | 'card'
): Promise<PaymentProviderChoice> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true },
  })

  const configured = (tenant?.settings as any)?.paymentProviders?.[method] as PaymentProviderChoice | undefined
  if (!configured) return 'MERCADOPAGO'

  // Confirma que a escolha salva ainda tem uma conexão válida — evita
  // tentar cobrar por um provedor que foi desconectado depois de escolhido.
  if (configured === 'STRIPE') {
    const connection = await prisma.stripeConnection.findFirst({ where: { tenantId, revokedAt: null } })
    return connection ? 'STRIPE' : 'MERCADOPAGO'
  }

  if (configured === 'EFI') {
    const connection = await prisma.efiConnection.findFirst({
      where: {
        tenantId,
        revokedAt: null,
        ...(method === 'pix' ? { pixKey: { not: null } } : {}),
      },
    })
    return connection ? 'EFI' : 'MERCADOPAGO'
  }

  if (configured === 'ASAAS') {
    const connection = await prisma.asaasConnection.findFirst({ where: { tenantId, revokedAt: null } })
    return connection ? 'ASAAS' : 'MERCADOPAGO'
  }

  return 'MERCADOPAGO'
}
