'use server'
// actions/settings/save-payment-settings.ts
//
// Salva as credenciais do Mercado Pago de cada restaurante.
// O accessToken é armazenado em tenant.settings.mercadoPagoAccessToken
// e usado automaticamente em create-order.ts para gerar PIX.
//
// SEGURANÇA:
// - O token nunca é retornado ao frontend (apenas uma flag "configurado")
// - Validamos o token chamando a API do MP antes de salvar
// - Apenas TENANT_ADMIN e MASTER_ADMIN podem alterar

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const schema = z.object({
  mercadoPagoAccessToken: z
    .string()
    .min(20, 'Token inválido')
    .startsWith('APP_USR-', 'O token deve começar com APP_USR-')
    .or(z.literal('')), // vazio = remover token
  mercadoPagoWebhookSecret: z.string().min(10, 'Secret inválido').or(z.literal('')),
  pixEnabled: z.enum(['true', 'false']),
})

export type PaymentSettingsState = {
  error?: string
  success?: boolean
  tokenValid?: boolean
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
    mercadoPagoAccessToken:     formData.get('mercadoPagoAccessToken') || '',
    mercadoPagoWebhookSecret:   formData.get('mercadoPagoWebhookSecret') || '',
    pixEnabled:                 formData.get('pixEnabled') || 'false',
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const { mercadoPagoAccessToken, mercadoPagoWebhookSecret, pixEnabled } = parsed.data

  // Se um token foi fornecido, valida contra a API do MP antes de salvar
  if (mercadoPagoAccessToken) {
    const isValid = await validateMercadoPagoToken(mercadoPagoAccessToken)
    if (!isValid) {
      return { error: 'Access Token inválido. Verifique se copiou corretamente do painel do Mercado Pago.' }
    }
  }

  // Buscar settings atuais para fazer merge (não sobrescrever outros campos)
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true },
  })
  const currentSettings = (tenant?.settings as Record<string, any>) ?? {}

  const updatedSettings = {
    ...currentSettings,
    pixEnabled: pixEnabled === 'true',
    // Só atualiza o token se um novo foi fornecido
    // Se string vazia, remove do settings (undefined = Prisma ignora na serialização JSON)
    ...(mercadoPagoAccessToken
      ? { mercadoPagoAccessToken }
      : { mercadoPagoAccessToken: null }),
    ...(mercadoPagoWebhookSecret
      ? { mercadoPagoWebhookSecret }
      : {}),
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: updatedSettings },
  })

  revalidatePath('/dashboard/settings/payments')

  return { success: true, tokenValid: !!mercadoPagoAccessToken }
}

// Valida o token chamando /users/me da API do MP
async function validateMercadoPagoToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
      // Timeout de 5s para não travar o formulário
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    // Se a API do MP estiver fora do ar, deixa passar (não bloqueia o restaurante)
    return true
  }
}

// Action para remover as credenciais (limpar)
export async function removePaymentCredentials(): Promise<PaymentSettingsState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const role = session.user.role
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(role)) {
    return { error: 'Sem permissão' }
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: session.user.tenantId },
    select: { settings: true },
  })
  const currentSettings = (tenant?.settings as Record<string, any>) ?? {}

  const { mercadoPagoAccessToken: _, mercadoPagoWebhookSecret: __, ...rest } = currentSettings

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { settings: { ...rest, pixEnabled: false } },
  })

  revalidatePath('/dashboard/settings/payments')
  return { success: true }
}
