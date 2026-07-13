'use server'

// actions/auth/register.ts

import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { hashPassword } from '@/lib/auth/password'
import { nanoid } from 'nanoid'

const registerSchema = z.object({
  tenantName:   z.string().min(2).max(100),
  slug:         z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'URL inválida — use apenas letras minúsculas, números e hífens').optional(),
  name:         z.string().min(2).max(100),
  email:        z.string().email('Email inválido').toLowerCase(),
  password:     z.string().min(8, 'Mínimo 8 caracteres'),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  cardToken:    z.string().optional(),
})

export type RegisterState = { error?: string; success?: boolean; pixInitPoint?: string; email?: string; password?: string }

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 50)
}

const PLAN_PRICE_MONTHLY = 3.00
const PLAN_PRICE_ANNUAL  = parseFloat((PLAN_PRICE_MONTHLY * 12 * 0.9).toFixed(2))

export async function registerAction(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    tenantName:   formData.get('tenantName'),
    slug:         formData.get('slug') || undefined,
    name:         formData.get('name'),
    email:        formData.get('email'),
    password:     formData.get('password'),
    billingCycle: formData.get('billingCycle') || 'MONTHLY',
    cardToken:    formData.get('cardToken') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const { tenantName, slug: rawSlug, name, email, password, billingCycle } = parsed.data

  // 1. Email duplicado
  const exists = await prisma.user.findFirst({ where: { email } })
  if (exists) return { error: 'Este email já está cadastrado.' }

  // 2. Slug único
  let slug = rawSlug ?? generateSlug(tenantName)
  const existingSlug = await prisma.tenant.findUnique({ where: { slug } })
  if (existingSlug) slug = `${slug}-${nanoid(4)}`

  // 3. Assinatura: cria só o registro local de TRIAL (7 dias grátis). Sem
  // cartão nenhum ainda — o cadastro nunca exigiu cartão de fato (o campo
  // cardToken existia no schema mas nunca era passado pra frente pro MP,
  // então a chamada ao /api/mp/preapproval aqui não fazia nada de útil).
  // O cartão real só é coletado na reativação, quando o trial vence
  // (actions/billing/reactivate-subscription.ts, que já usa Efí Bank).
  const mpResult: { subscriptionId?: string; pixInitPoint?: string; error?: string } = {}

  const passwordHash = await hashPassword(password)
  const trialEndsAt  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const isAnnual     = billingCycle === 'ANNUAL'
  const amount       = isAnnual ? PLAN_PRICE_ANNUAL : PLAN_PRICE_MONTHLY

  // 4. Criar tenant, usuário e estrutura inicial
  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug,
          plan: 'PRO',
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

      await tx.subscription.create({
        data: {
          tenantId:           tenant.id,
          plan:               'PRO',
          provider:           'EFI',
          billingCycle:       billingCycle as any,
          status:             'TRIAL',
          currentPeriodStart: new Date(),
          currentPeriodEnd:   trialEndsAt,
          amount,
        },
      })

      await tx.pDV.create({
        data: { tenantId: tenant.id, name: tenantName, type: 'STORE', isActive: true },
      })

      const defaultHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        tenantId: tenant.id,
        dayOfWeek: day,
        openTime:  '11:00',
        closeTime: '23:00',
        isOpen:    day !== 0,
      }))
      await tx.businessHour.createMany({ data: defaultHours })
    })
  } catch (err: any) {
    console.error('[register] erro ao criar tenant:', err)
    return { error: 'Erro ao criar conta. Tente novamente.' }
  }

  // 5. Retornar sucesso com credenciais para o cliente fazer login via signIn do NextAuth
  // Não fazemos signIn no servidor para evitar conflito com NEXT_REDIRECT
  return {
    success: true,
    pixInitPoint: mpResult.pixInitPoint,
    email,
    password, // necessário para auto-login no cliente
  }
}

