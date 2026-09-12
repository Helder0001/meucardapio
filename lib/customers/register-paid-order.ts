// lib/customers/register-paid-order.ts
//
// CORREÇÃO (#5): totalOrders/totalSpent do Customer são estatísticas
// cumulativas usadas em vários lugares (lista de clientes, tag "Cliente
// Fiel", estatísticas da aba Cliente). Antes, isso era incrementado na
// hora que o PEDIDO era criado — não quando o pagamento era de fato
// confirmado. Resultado: um pedido "pague na entrega" ou um Pix nunca
// confirmado já contava como dinheiro recebido do cliente.
//
// Esta função centraliza o incremento correto: chamar UMA VEZ, no
// momento exato em que um pedido passa a ter paymentStatus = 'PAID'
// (mark-paid, pay-card, webhooks do Mercado Pago/Asaas/Efí). Nunca
// chamar na criação do pedido.
//
// Idempotência: recebe o paymentStatus ANTERIOR do pedido — só
// incrementa se ele não estava PAID antes (evita contar em dobro se um
// webhook for reenviado, ou se mark-paid for chamado mais de uma vez por
// engano).

import type { Prisma } from '@prisma/client'

export async function registerPaidOrderForCustomer(
  tx: Prisma.TransactionClient,
  params: { customerId: string | null; previousPaymentStatus: string; total: number }
): Promise<void> {
  const { customerId, previousPaymentStatus, total } = params
  if (!customerId) return
  if (previousPaymentStatus === 'PAID') return // já tinha sido contado antes

  await tx.customer.update({
    where: { id: customerId },
    data: {
      totalOrders: { increment: 1 },
      totalSpent: { increment: total },
      lastOrderAt: new Date(),
    },
  })
}
