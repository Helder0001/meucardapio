'use server'

// actions/billing/cancel-subscription.ts
//
// Cancela a assinatura do plano PRO (Meu Cardápio) do tenant logado.
//
// Regra de negócio pedida: cancelar não derruba o acesso na hora — o
// estabelecimento continua acessando o dashboard normalmente até o fim do
// ciclo já pago (currentPeriodEnd). O que precisa acontecer imediatamente é
// impedir a PRÓXIMA cobrança no cartão. Por isso:
//
// 1. Chamamos PUT /subscription/{id}/cancel na Efí — isso cancela o
//    mandato e garante que nenhuma cobrança futura será tentada, mesmo
//    que o usuário feche a aba antes do cron rodar.
// 2. NÃO mexemos em subscription.status nem em tenant.subscriptionStatus
//    aqui — eles continuam ACTIVE, então o paywall do dashboard
//    (app/(dashboard)/layout.tsx) não bloqueia nada agora.
// 3. Marcamos cancelledAt (quando foi solicitado) e cancelReason. O cron
//    diário (app/api/internal/cron/subscription-check/route.ts) é quem,
//    ao detectar que currentPeriodEnd já passou E cancelledAt está setado,
//    finaliza: subscription.status = CANCELLED, tenant.subscriptionStatus =
//    CANCELLED — só então o paywall passa a bloquear.

import { prisma } from '@/lib/db/client'
import { auth } from '@/lib/auth/session'
import { cancelEfiSubscription } from '@/lib/efi/subscription'

export type CancelSubscriptionResult = { error?: string; accessUntil?: string }

export async function cancelSubscriptionAction(reason?: string): Promise<CancelSubscriptionResult> {
  const session = await auth()
  if (!session?.user?.tenantId || session.user.role === 'MASTER_ADMIN') {
    return { error: 'Sessão inválida.' }
  }

  // Ação sensível de billing: só o dono do estabelecimento pode cancelar a
  // assinatura da plataforma (não confundir com permissões de pedidos/menu).
  if (session.user.role !== 'TENANT_ADMIN') {
    return { error: 'Apenas o administrador do estabelecimento pode cancelar a assinatura.' }
  }

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId: session.user.tenantId },
  })
  if (!subscription) {
    return { error: 'Nenhuma assinatura encontrada.' }
  }

  if (subscription.status === 'CANCELLED') {
    return { error: 'Assinatura já está cancelada.' }
  }

  if (subscription.cancelledAt) {
    // Já solicitou antes — idempotente, só devolve a data de acesso.
    return { accessUntil: subscription.currentPeriodEnd.toISOString() }
  }

  // Cancela o mandato na Efí — impede qualquer cobrança futura imediatamente.
  if (subscription.efiSubscriptionId) {
    if (!process.env.EFI_CLIENT_ID || !process.env.EFI_CLIENT_SECRET) {
      return { error: 'Pagamento não configurado no servidor. Contate o suporte.' }
    }
    try {
      await cancelEfiSubscription(subscription.efiSubscriptionId)
    } catch (err) {
      console.error('[cancel-subscription][efi] Erro ao cancelar assinatura', String(err))
      return { error: 'Não foi possível cancelar a cobrança automática. Tente novamente ou contate o suporte.' }
    }
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      cancelledAt: new Date(),
      cancelReason: reason?.trim() || 'Cancelado pelo cliente via dashboard',
    },
  })

  return { accessUntil: subscription.currentPeriodEnd.toISOString() }
}
