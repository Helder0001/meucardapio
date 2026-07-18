'use server'

// actions/billing/update-card.ts
//
// Troca o cartão vinculado à assinatura ATIVA do tenant, sem gerar
// cobrança nenhuma na hora — só define qual cartão será usado na PRÓXIMA
// cobrança recorrente (PUT /v1/subscription/:id na Efí, endpoint diferente
// do de retry/cobrança). Ver lib/efi/subscription.ts:updateEfiSubscriptionCard.

import { prisma } from '@/lib/db/client'
import { auth } from '@/lib/auth/session'
import { updateEfiSubscriptionCard } from '@/lib/efi/subscription'
import { onlyDigits } from '@/lib/utils/cpf'

export interface UpdateCardInput {
  cardToken: string // payment_token da Efí (Efí.js)
  cardLast4: string // 4 últimos dígitos, extraídos no navegador — só pra exibir
}

export type UpdateCardResult = { error?: string; success?: boolean }

export async function updateCardAction(input: UpdateCardInput): Promise<UpdateCardResult> {
  const session = await auth()
  if (!session?.user?.tenantId || session.user.role === 'MASTER_ADMIN') {
    return { error: 'Sessão inválida.' }
  }

  // Ação sensível de billing: só o dono do estabelecimento mexe no cartão
  // da assinatura da plataforma.
  if (session.user.role !== 'TENANT_ADMIN') {
    return { error: 'Apenas o administrador do estabelecimento pode trocar o cartão.' }
  }

  const { cardToken, cardLast4 } = input
  if (!cardToken || onlyDigits(cardLast4).length !== 4) {
    return { error: 'Dados do cartão incompletos.' }
  }

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId: session.user.tenantId },
  })
  if (!subscription) {
    return { error: 'Nenhuma assinatura encontrada.' }
  }
  if (!subscription.efiSubscriptionId) {
    return { error: 'Assinatura sem cobrança recorrente configurada. Contate o suporte.' }
  }
  if (subscription.status === 'CANCELLED') {
    return { error: 'Assinatura cancelada — não é possível trocar o cartão.' }
  }
  if (subscription.cancelledAt) {
    return { error: 'Cancelamento já solicitado — não é possível trocar o cartão. Contate o suporte se quiser reverter.' }
  }

  if (!process.env.EFI_CLIENT_ID || !process.env.EFI_CLIENT_SECRET) {
    return { error: 'Pagamento não configurado no servidor. Contate o suporte.' }
  }

  try {
    await updateEfiSubscriptionCard(subscription.efiSubscriptionId, cardToken)
  } catch (err) {
    console.error('[update-card][efi] erro ao trocar cartão:', err)
    return { error: 'Não foi possível validar o novo cartão. Confira os dados e tente novamente.' }
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { cardLast4: onlyDigits(cardLast4) },
  })

  return { success: true }
}
