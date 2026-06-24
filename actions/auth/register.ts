'use server'

// actions/auth/register.ts
//
// Fluxo:
// 1. Validar dados + cardToken (tokenizado no frontend via MP SDK)
// 2. Verificar email duplicado
// 3. Chamar /api/mp/preapproval (API Route com maxDuration=60) para criar assinatura trial
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
  // passar o motor antifraude do MP em produção
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

  // 3. Criar assinatura trial no Mercado Pago via API Route dedicada
  //    (usa maxDuration=60 — Server Actions não suportam essa configuração)
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
          role: 'TENANT_ADMIN' as any,
          isActive: true,
        },
      })

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

// ── Chama a API Route /api/mp/preapproval que tem maxDuration=60 ──────────────
async function createMpSubscription(params: {
  tenantName: string
  email: string
  cardToken: string
  firstName: string
  lastName: string
  cpf: string
}): Promise<{ subscriptionId?: string; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.error('[register] NEXT_PUBLIC_APP_URL não configurado')
    return { error: 'Configuração do servidor inválida.' }
  }

  // Se MERCADOPAGO_ACCESS_TOKEN não estiver configurado, pula validação (dev local)
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    console.warn('[register] MERCADOPAGO_ACCESS_TOKEN not set — skipping card validation')
    return {}
  }

  try {
    console.log('[register] chamando /api/mp/preapproval...')

    const res = await fetch(`${appUrl}/api/mp/preapproval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: `Meu Cardápio — Plano Starter — ${params.tenantName}`,
        payer_email: params.email,
        card_token_id: params.cardToken,
        payer: {
          email: params.email,
          first_name: params.firstName || 'Nome',
          last_name:  params.lastName  || 'Sobrenome',
          identification: {
            type:   'CPF',
            number: params.cpf || '',
          },
        },
      }),
    })

    const data = await res.json()
    console.log('[register] /api/mp/preapproval response:', res.status, JSON.stringify(data))

    if (!res.ok) {
      return { error: data.error ?? 'Erro ao processar cartão. Tente novamente.' }
    }

    return { subscriptionId: data.subscriptionId }
  } catch (err: any) {
    console.error('[register] erro ao chamar /api/mp/preapproval:', err)
    return { error: 'Erro ao processar cartão. Tente novamente.' }
  }
}
