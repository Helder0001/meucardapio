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
// 1. Chamamos PUT /preapproval/{id} com status: 'cancelled' na hora — isso
//    cancela o mandato no Mercado Pago e garante que nenhuma cobrança futura
//    será tentada, mesmo que o usuário feche a aba antes do cron rodar.
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

  // MIGRAÇÃO: assinaturas criadas depois da troca pra Efí Bank cancelam por
  // lá; assinaturas antigas (criadas quando ainda era Mercado Pago)
  // continuam cancelando no MP — o campo `provider` diz qual API usar.
  if (subscription.provider === 'EFI' && subscription.efiSubscriptionId) {
    if (!process.env.EFI_CLIENT_ID || !process.env.EFI_CLIENT_SECRET) {
      return { error: 'Pagamento não configurado no servidor. Contate o suporte.' }
    }
    try {
      await cancelEfiSubscription(subscription.efiSubscriptionId)
    } catch (err) {
      console.error('[cancel-subscription][efi] Erro ao cancelar assinatura', String(err))
      return { error: 'Não foi possível cancelar a cobrança automática. Tente novamente ou contate o suporte.' }
    }
  } else if (subscription.mercadoPagoSubId) {
    // Cancela o mandato no Mercado Pago (credenciais da PLATAFORMA — é a
    // cobrança do plano do Meu Cardápio, não um pagamento do tenant).
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      return { error: 'Pagamento não configurado no servidor. Contate o suporte.' }
    }

    try {
      const res = await fetch(`https://api.mercadopago.com/preapproval/${subscription.mercadoPagoSubId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        console.error('[cancel-subscription] Erro ao cancelar preapproval no MP', {
          subscriptionId: subscription.mercadoPagoSubId,
          status: res.status,
          body: errBody.slice(0, 1000),
        })
        return { error: 'Não foi possível cancelar a cobrança automática. Tente novamente ou contate o suporte.' }
      }
    } catch (err) {
      console.error('[cancel-subscription] Exceção ao cancelar preapproval no MP', String(err))
      return { error: 'Erro ao conectar ao Mercado Pago. Tente novamente.' }
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
