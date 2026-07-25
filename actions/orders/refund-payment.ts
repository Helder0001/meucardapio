'use server'

// actions/orders/refund-payment.ts
//
// Estorna o pagamento de um pedido — detecta automaticamente Pix vs
// Cartão e chama a API certa da Efí. Começando só por Efí (13/07);
// Stripe/MP entram depois.
//
// Botão aparece pra qualquer papel na tela (staff não fica se perguntando
// por que sumiu), mas a ação em si só é permitida pra TENANT_ADMIN e
// MANAGER — reforçado aqui no servidor, não só escondendo/desabilitando
// no client.

import { prisma } from '@/lib/db/client'
import { auth } from '@/lib/auth/session'
import { refundEfiCardCharge } from '@/lib/efi/tenant-payments'
import { refundTenantPixPayment } from '@/lib/efi/tenant-pix-client'
import { auditLog, AuditActions } from '@/lib/utils/audit'

export type RefundPaymentResult = { error?: string; success?: boolean }

export async function refundPaymentAction(orderId: string): Promise<RefundPaymentResult> {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return { error: 'Sessão inválida.' }
  }

  // Reforço no servidor: só admin/gerente estornam, mesmo que o botão
  // apareça pra todo mundo na tela.
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return { error: 'Só administradores e gerentes podem estornar pagamentos.' }
  }

  const tenantId = session.user.tenantId

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: {
      payments: { where: { status: 'PAID' }, orderBy: { paidAt: 'desc' } },
    },
  })
  if (!order) return { error: 'Pedido não encontrado.' }

  const payment = order.payments[0]
  if (!payment) return { error: 'Nenhum pagamento confirmado encontrado para este pedido.' }

  if (payment.provider !== 'EFI') {
    return {
      error: `Estorno automático ainda não disponível pra ${payment.provider === 'MERCADOPAGO' ? 'Mercado Pago' : payment.provider} — só Efí Bank por enquanto. Estorne manualmente direto no painel do provedor.`,
    }
  }

  const amount = Number(payment.amount)

  try {
    if (payment.method === 'PIX') {
      if (!payment.pixEndToEndId) {
        return { error: 'Esse Pix não tem o identificador (e2eId) necessário pro estorno — só é possível estornar Pix confirmados depois de 13/07/2026.' }
      }
      await refundTenantPixPayment({ tenantId, e2eId: payment.pixEndToEndId, amount })
    } else if (payment.method === 'CREDIT_CARD') {
      if (!payment.providerReference) {
        return { error: 'Esse pagamento não tem a referência da cobrança necessária pro estorno.' }
      }
      await refundEfiCardCharge({ tenantId, chargeId: payment.providerReference, amount })
    } else {
      return { error: `Estorno automático não disponível pra forma de pagamento ${payment.method}.` }
    }
  } catch (err) {
    console.error('[refund-payment][efi]', err)
    const detail = err instanceof Error ? err.message : String(err)
    return { error: `Não foi possível estornar: ${detail}` }
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
        refundAmount: amount,
        refundedByUserId: session.user.id,
      },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    }),
  ])

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.ORDER_REFUNDED,
    resource: 'order',
    resourceId: order.id,
    newValue: { paymentId: payment.id, method: payment.method, amount },
  })

  return { success: true }
}
