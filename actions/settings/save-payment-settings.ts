'use server'
// actions/settings/save-payment-settings.ts
//
// Salva a configuração de PIX/pagamentos de cada restaurante.
//
// HISTÓRICO: este arquivo cuidava de salvar o Access Token do Mercado Pago
// colado manualmente pelo lojista. Isso foi substituído pelo fluxo OAuth
// (Mercado Pago Connect — ver app/api/mercadopago/connect e callback), que
// é mais seguro (token nunca passa pelo navegador do lojista) e não expira
// sem avisar. Esta action agora só cuida do que sobrou fora do OAuth:
// o Webhook Secret e o toggle de "PIX habilitado".
//
// SEGURANÇA:
// - Apenas TENANT_ADMIN, MASTER_ADMIN e MANAGER podem alterar

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const schema = z.object({
  mercadoPagoWebhookSecret: z.string().min(10, 'Secret inválido').or(z.literal('')),
})

export type PaymentSettingsState = {
  error?: string
  success?: boolean
}

export async function savePaymentSettings(
  _prev: PaymentSettingsState,
  formData: FormData
): Promise<PaymentSettingsState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const role = session.user.role
  if (!['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(role)) {
    return { error: 'Você não tem permissão para alterar configurações de pagamento' }
  }

  const tenantId = session.user.tenantId

  const raw = {
    mercadoPagoWebhookSecret: formData.get('mercadoPagoWebhookSecret') || '',
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { mercadoPagoWebhookSecret } = parsed.data
  if (!mercadoPagoWebhookSecret) return { success: true } // nada pra salvar

  // Buscar settings atuais para fazer merge (não sobrescrever outros campos)
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true },
  })
  const currentSettings = (tenant?.settings as Record<string, any>) ?? {}

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { ...currentSettings, mercadoPagoWebhookSecret } },
  })

  revalidatePath('/dashboard/settings/payments')

  return { success: true }
}

export type ToggleState = { error?: string; success?: boolean; value?: boolean }

// Toggle de "PIX habilitado" / "Cartão online habilitado" — salva IMEDIATAMENTE
// ao clicar (nada de esperar um botão "Salvar configurações" separado, que
// gerava confusão: o lojista trocava o toggle, saía da tela sem apertar
// "Salvar" e via tudo voltar ao estado anterior).
export async function togglePaymentOption(
  field: 'pixEnabled' | 'cardEnabled' | 'linkEnabled',
  enabled: boolean
): Promise<ToggleState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const role = session.user.role
  if (!['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(role)) {
    return { error: 'Você não tem permissão para alterar configurações de pagamento' }
  }

  const tenantId = session.user.tenantId

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true, slug: true },
  })
  const currentSettings = (tenant?.settings as Record<string, any>) ?? {}

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { ...currentSettings, [field]: enabled } },
  })

  revalidatePath('/dashboard/settings/payments')
  revalidatePath('/dashboard/orders/kanban')
  // A página do cardápio digital usa ISR (revalidate = 60s) — sem isso, o
  // toggle de PIX/cartão só refletiria pro cliente depois do cache expirar.
  if (tenant?.slug) revalidatePath(`/menu/${tenant.slug}`)

  return { success: true, value: enabled }
}

// Action para remover o token LEGADO (colado manualmente antes do OAuth
// existir) e o webhook secret manual. Não afeta a conexão OAuth — para
// desconectar a conta MP via OAuth, use /api/mercadopago/disconnect.
export async function removePaymentCredentials(): Promise<PaymentSettingsState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const role = session.user.role
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(role)) {
    return { error: 'Sem permissão' }
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: session.user.tenantId },
    select: { settings: true, slug: true },
  })
  const currentSettings = (tenant?.settings as Record<string, any>) ?? {}

  const { mercadoPagoAccessToken: _, mercadoPagoWebhookSecret: __, ...rest } = currentSettings

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { settings: { ...rest, pixEnabled: false, cardEnabled: false } },
  })

  revalidatePath('/dashboard/settings/payments')
  if (tenant?.slug) revalidatePath(`/menu/${tenant.slug}`)
  return { success: true }
}
