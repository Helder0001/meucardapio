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
import { asaasRequestWithKey, AsaasError } from '@/lib/asaas/client'
import { encrypt as encryptSecret } from '@/lib/security/crypto'
import { randomBytes } from 'crypto'

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
  field: 'pixEnabled' | 'cardEnabled' | 'linkEnabled' | 'manualPixEnabled',
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

  // Só permite ligar o Pix manual se a chave já estiver cadastrada —
  // evita habilitar a opção no cardápio/PDV sem ter pra onde gerar o QR.
  if (field === 'manualPixEnabled' && enabled && !currentSettings.manualPixKey) {
    return { error: 'Cadastre a chave Pix antes de habilitar.' }
  }

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

export type ManualPixState = { error?: string; success?: boolean }

const manualPixSchema = z.object({
  keyType: z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM']),
  key: z.string().min(3, 'Informe a chave Pix'),
  receiverName: z.string().min(2, 'Informe o nome do favorecido').max(25, 'Máximo 25 caracteres'),
  city: z.string().min(2, 'Informe a cidade').max(15, 'Máximo 15 caracteres'),
})

// Salva a chave Pix própria do estabelecimento, usada para gerar o QR
// Code/copia-e-cola do "Pix manual" — sem passar por nenhum gateway.
export async function saveManualPixSettings(
  _prev: ManualPixState,
  formData: FormData
): Promise<ManualPixState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const role = session.user.role
  if (!['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(role)) {
    return { error: 'Você não tem permissão para alterar configurações de pagamento' }
  }

  const parsed = manualPixSchema.safeParse({
    keyType: formData.get('manualPixKeyType'),
    key: formData.get('manualPixKey'),
    receiverName: formData.get('manualPixReceiverName'),
    city: formData.get('manualPixCity'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const tenantId = session.user.tenantId
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true, slug: true },
  })
  const currentSettings = (tenant?.settings as Record<string, any>) ?? {}

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        ...currentSettings,
        manualPixKeyType: parsed.data.keyType,
        manualPixKey: parsed.data.key,
        manualPixReceiverName: parsed.data.receiverName,
        manualPixCity: parsed.data.city,
      },
    },
  })

  revalidatePath('/dashboard/settings/payments')
  if (tenant?.slug) revalidatePath(`/menu/${tenant.slug}`)

  return { success: true }
}

// Remove a chave Pix manual cadastrada — desliga o toggle junto, senão
// ficaria "habilitado" sem nenhuma chave pra gerar QR Code.
export async function removeManualPixSettings(): Promise<ManualPixState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const role = session.user.role
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(role)) {
    return { error: 'Sem permissão' }
  }

  const tenantId = session.user.tenantId
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true, slug: true },
  })
  const currentSettings = (tenant?.settings as Record<string, any>) ?? {}
  const {
    manualPixKey: _k, manualPixKeyType: _t, manualPixReceiverName: _r, manualPixCity: _c,
    ...rest
  } = currentSettings

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { ...rest, manualPixEnabled: false } },
  })

  revalidatePath('/dashboard/settings/payments')
  if (tenant?.slug) revalidatePath(`/menu/${tenant.slug}`)
  return { success: true }
}

export type ProviderChoice = 'MERCADOPAGO' | 'STRIPE' | 'EFI' | 'ASAAS'

// Escolhe qual provedor conectado processa cada método (Pix/Cartão). O
// "Link de pagamento" (Checkout Pro) continua exclusivo do Mercado Pago
// por enquanto — Stripe e Efí não têm um equivalente direto de link
// hospedado avulso no mesmo formato.
export async function setPaymentProvider(
  method: 'pix' | 'card',
  provider: ProviderChoice
): Promise<ToggleState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const role = session.user.role
  if (!['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(role)) {
    return { error: 'Você não tem permissão para alterar configurações de pagamento' }
  }

  const tenantId = session.user.tenantId

  // Só permite escolher um provedor que o tenant realmente conectou —
  // evita salvar uma escolha "fantasma" que nunca vai funcionar.
  if (provider !== 'MERCADOPAGO') {
    const isConnected =
      provider === 'STRIPE'
        ? await prisma.stripeConnection.findFirst({ where: { tenantId, revokedAt: null } })
        : provider === 'ASAAS'
        ? await prisma.asaasConnection.findFirst({ where: { tenantId, revokedAt: null } })
        : await prisma.efiConnection.findFirst({
            where: {
              tenantId,
              revokedAt: null,
              ...(method === 'pix' ? { pixKey: { not: null } } : {}),
            },
          })
    if (!isConnected) {
      const providerLabel = provider === 'STRIPE' ? 'Stripe' : provider === 'ASAAS' ? 'o Asaas' : 'a Efí'
      return { error: `Conecte ${providerLabel} antes de escolher esse provedor.` }
    }
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true, slug: true },
  })
  const currentSettings = (tenant?.settings as Record<string, any>) ?? {}
  const paymentProviders = { ...(currentSettings.paymentProviders ?? {}), [method]: provider }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { ...currentSettings, paymentProviders } },
  })

  revalidatePath('/dashboard/settings/payments')
  if (tenant?.slug) revalidatePath(`/menu/${tenant.slug}`)

  return { success: true }
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

// ── Asaas — conecta colando a API Key (sem OAuth) ──────────────────────────
// A Asaas não tem fluxo de autorização como o Mercado Pago/Stripe: o
// lojista gera a própria API Key no painel dele (Integrações → Chaves de
// API) e cola aqui. Validamos a chave chamando /myAccount antes de salvar,
// e registramos um webhook via API pra receber a confirmação dos
// pagamentos automaticamente.
export type AsaasConnectState = { error?: string; success?: boolean }

export async function connectAsaas(
  _prev: AsaasConnectState,
  formData: FormData
): Promise<AsaasConnectState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const role = session.user.role
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(role)) {
    return { error: 'Você não tem permissão para alterar configurações de pagamento' }
  }

  const apiKey = (formData.get('asaasApiKey') as string)?.trim()
  if (!apiKey) return { error: 'Cole a API Key do Asaas' }

  const tenantId = session.user.tenantId
  const baseUrl = 'https://api.asaas.com/v3'

  // Valida a chave chamando /myAccount — se a chave for inválida, o Asaas
  // já responde 401 aqui, antes de salvarmos qualquer coisa.
  let accountId: string | undefined
  try {
    const account = await asaasRequestWithKey<{ id: string }>(apiKey, baseUrl, '/myAccount')
    accountId = account.id
  } catch (err) {
    if (err instanceof AsaasError) {
      return { error: err.status === 401 ? 'API Key inválida — confira se copiou certinho.' : err.message }
    }
    return { error: 'Não foi possível validar a API Key com o Asaas. Tente novamente.' }
  }

  // Gera um token próprio e registra o webhook via API — assim os
  // pagamentos confirmados chegam automaticamente, sem o lojista precisar
  // configurar nada manualmente no painel do Asaas.
  const webhookToken = randomBytes(32).toString('hex')
  let webhookId: string | undefined
  try {
    const webhook = await asaasRequestWithKey<{ id: string }>(apiKey, baseUrl, '/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Meu Cardápio',
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/asaas?tenantId=${tenantId}`,
        enabled: true,
        interrupted: false,
        authToken: webhookToken,
        sendType: 'SEQUENTIALLY',
        events: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'],
      }),
    })
    webhookId = webhook.id
  } catch (err) {
    console.error('[asaas][connect] Falha ao registrar webhook:', err)
    // Não bloqueia a conexão — sem webhook, os pagamentos só atualizam
    // quando o lojista confirmar manualmente ou via polling futuro.
  }

  await prisma.asaasConnection.upsert({
    where: { tenantId },
    create: {
      tenantId,
      apiKeyEnc: encryptSecret(apiKey),
      asaasAccountId: accountId,
      webhookTokenEnc: webhookId ? encryptSecret(webhookToken) : undefined,
      webhookId,
      connectedByUserId: session.user.id,
    },
    update: {
      apiKeyEnc: encryptSecret(apiKey),
      asaasAccountId: accountId,
      webhookTokenEnc: webhookId ? encryptSecret(webhookToken) : undefined,
      webhookId,
      revokedAt: null,
      connectedByUserId: session.user.id,
    },
  })

  revalidatePath('/dashboard/settings/payments')
  return { success: true }
}

export async function disconnectAsaas(): Promise<AsaasConnectState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const role = session.user.role
  if (!['TENANT_ADMIN', 'MASTER_ADMIN'].includes(role)) {
    return { error: 'Sem permissão' }
  }

  const tenantId = session.user.tenantId

  await prisma.asaasConnection.updateMany({
    where: { tenantId },
    data: { revokedAt: new Date() },
  })

  // Se o Asaas estava escolhido como provedor de pix/cartão, volta pro MP
  // padrão — evita deixar a loja sem forma de cobrar depois de desconectar.
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { settings: true, slug: true } })
  const currentSettings = (tenant?.settings as Record<string, any>) ?? {}
  const paymentProviders = { ...(currentSettings.paymentProviders ?? {}) }
  for (const method of ['pix', 'card'] as const) {
    if (paymentProviders[method] === 'ASAAS') paymentProviders[method] = 'MERCADOPAGO'
  }
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings: { ...currentSettings, paymentProviders } } })

  revalidatePath('/dashboard/settings/payments')
  if (tenant?.slug) revalidatePath(`/menu/${tenant.slug}`)
  return { success: true }
}
