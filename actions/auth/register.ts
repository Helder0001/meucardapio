'use server'

// actions/auth/register.ts
//
// Fluxo:
// 1. Validar dados + cardToken (tokenizado no frontend via MP SDK)
// 2. Verificar email duplicado
// 3. Criar assinatura trial no Mercado Pago (preapproval com start_date +7 dias)
// 4. Criar tenant + admin + PDV + horários (transação)
// 5. Login automático

import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { hashPassword } from '@/lib/auth/password'
import { signIn } from '@/lib/auth/session'
import { nanoid } from 'nanoid'

const registerSchema = z.object({
  tenantName: z.string().min(2).max(100),
  slug:       z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'URL inválida — use apenas letras minúsculas, números e hífens').optional(),
  name:       z.string().min(2).max(100),
  email:      z.string().email('Email inválido').toLowerCase(),
  password:   z.string().min(8, 'Mínimo 8 caracteres'),
  cardToken:  z.string().min(1, 'Cartão obrigatório para ativar o trial'),
})

export type RegisterState = { error?: string; success?: boolean }

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 50)
}

export async function registerAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    tenantName: formData.get('tenantName'),
    slug:       formData.get('slug') || undefined,
    name:       formData.get('name'),
    email:      formData.get('email'),
    password:   formData.get('password'),
    cardToken:  formData.get('cardToken'),
  })

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const { tenantName, slug: rawSlug, name, email, password, cardToken } = parsed.data

  // Nome e CPF do titular do cartão — usados no payload da preapproval pra
  // passar o motor antifraude do MP em produção (CC_VAL_433 sem esses campos)
  const cardName = (formData.get('cardName') as string | null) ?? ''
  const cardCpf  = (formData.get('cardCpf')  as string | null) ?? ''
  const [firstName = '', ...lastParts] = cardName.trim().split(' ')
  const lastName = lastParts.join(' ')

  // 1. Email duplicado
  const exists = await prisma.user.findFirst({ where: { email } })
  if (exists) return { error: 'Este email já está cadastrado.' }

  // 2. Slug único
  let slug = rawSlug ?? generateSlug(tenantName)
  const existingSlug = await prisma.tenant.findUnique({ where: { slug } })
  if (existingSlug) slug = `${slug}-${nanoid(4)}`

  // 3. Criar assinatura trial no Mercado Pago ANTES de salvar no banco
  //    Se o cartão for inválido, não cria o tenant
  const mpResult = await createMpSubscription({ tenantName, email, cardToken, firstName, lastName, cpf: cardCpf })
  if (mpResult.error) return { error: mpResult.error }

  const passwordHash = await hashPassword(password)
  const trialEndsAt  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug,
          plan: 'STARTER',
          subscriptionStatus: 'TRIAL',
          trialEndsAt,
          primaryColor: '#f97316',
          settings: {},
        },
      })

      await tx.user.create({
        data: {
          tenantId: tenant.id,
          name,
          email,
          passwordHash,
          role: 'TENANT_ADMIN',
          isActive: true,
        },
      })

      // Salvar referência da assinatura MP
      if (mpResult.subscriptionId) {
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            plan: 'STARTER',
            status: 'TRIAL',
            mercadoPagoSubId: mpResult.subscriptionId,
            currentPeriodStart: new Date(),
            currentPeriodEnd: trialEndsAt,
            amount: 49.00,
          },
        })
      }

      await tx.pDV.create({
        data: { tenantId: tenant.id, name: tenantName, type: 'STORE', isActive: true },
      })

      const defaultHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        tenantId: tenant.id,
        dayOfWeek: day,
        openTime: '11:00',
        closeTime: '23:00',
        isOpen: day !== 0,
      }))
      await tx.businessHour.createMany({ data: defaultHours })
    })

    await signIn('credentials', { email, password, redirectTo: '/dashboard/onboarding' })
    return { success: true }
  } catch (err: any) {
    if (err?.digest === 'NEXT_REDIRECT') throw err
    console.error('[register]', err)
    return { error: 'Erro ao criar conta. Tente novamente.' }
  }
}

// ── Cria a preapproval (assinatura recorrente) no Mercado Pago ────────────────
async function createMpSubscription(params: {
  tenantName: string
  email: string
  cardToken: string
  firstName: string
  lastName: string
  cpf: string
}): Promise<{ subscriptionId?: string; error?: string }> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) {
    console.warn('[register] MERCADOPAGO_ACCESS_TOKEN not set — skipping card validation')
    return {}
  }

  // Abort após 8s para não estourar o timeout da Vercel (10s)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  try {
    // Trial de 7 dias via start_date atrasado — free_trial não existe em
    // auto_recurring para o endpoint preapproval do MP
    const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const payload = {
      reason: `Meu Cardápio — Plano Starter — ${params.tenantName}`,
      payer_email: params.email,
      card_token_id: params.cardToken,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 49.00,
        currency_id: 'BRL',
      },
      start_date: startDate.toISOString(),
      back_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      status: 'authorized',
      payer: {
        email: params.email,
        first_name: params.firstName || 'Nome',
        last_name:  params.lastName  || 'Sobrenome',
        identification: {
          type:   'CPF',
          number: params.cpf || '',
        },
      },
    }

    // Log do payload (token truncado por segurança)
    console.log('[register/mp] payload:', JSON.stringify({
      ...payload,
      card_token_id: payload.card_token_id ? `${payload.card_token_id.slice(0, 8)}...` : null,
    }))

    const res = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `register-${params.email}-${Date.now()}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const data = await res.json()
    console.log('[register/mp] response status:', res.status, 'body:', JSON.stringify(data))

    if (!res.ok) {
      console.error('[register/mp] preapproval error:', JSON.stringify(data))

      // Extrair mensagem de erro do MP (pode vir em campos diferentes)
      const msg: string = data?.message ?? data?.error ?? 'Erro ao processar cartão'
      const causes: string = JSON.stringify(data?.cause ?? data?.causes ?? '')

      // CC_VAL_433 = token inválido ou gerado com Public Key diferente do Access Token
      if (msg.includes('CC_VAL_433') || causes.includes('CC_VAL_433')) {
        return { error: 'Dados do cartão inválidos. Verifique os dados e tente novamente.' }
      }
      if (msg.includes('cc_rejected') || msg.includes('rejected')) {
        return { error: 'Cartão recusado. Verifique os dados ou use outro cartão.' }
      }
      if (msg.includes('invalid') || msg.includes('Invalid')) {
        return { error: 'Dados do cartão inválidos. Verifique e tente novamente.' }
      }

      return { error: msg }
    }

    return { subscriptionId: String(data.id) }
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      console.error('[register/mp] TIMEOUT — requisição abortada após 8s')
      return { error: 'Tempo limite excedido ao processar cartão. Tente novamente.' }
    }
    console.error('[register/mp] catch error:', err)
    return { error: 'Erro ao processar cartão. Tente novamente.' }
  }
}
