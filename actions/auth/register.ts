'use server'

// actions/auth/register.ts

import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { hashPassword } from '@/lib/auth/password'
import { nanoid } from 'nanoid'
import { createEfiCardSubscription } from '@/lib/efi/subscription'
import { onlyDigits } from '@/lib/utils/cpf'

const registerSchema = z.object({
  tenantName:   z.string().min(2).max(100),
  slug:         z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'URL inválida — use apenas letras minúsculas, números e hífens').optional(),
  name:         z.string().min(2).max(100),
  email:        z.string().email('Email inválido').toLowerCase(),
  password:     z.string().min(8, 'Mínimo 8 caracteres'),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  // Cartão agora é OBRIGATÓRIO no cadastro (decisão de produto: sem cartão
  // válido, a conta não é criada) — veja startImmediately abaixo pra saber
  // se ele é cobrado em 7 dias (trial) ou imediatamente.
  cardToken:      z.string().min(1, 'Dados do cartão são obrigatórios.'),
  cardholderName: z.string().min(2, 'Informe o nome impresso no cartão.'),
  payerCpf:       z.string().min(11, 'CPF inválido.'),
  payerPhone:     z.string().min(10, 'Telefone inválido, informe com DDD.'),
  // 'true'  -> cobra na hora, sem trial, acesso liberado assim que o
  //            pagamento for confirmado.
  // 'false' (padrão) -> 7 dias grátis; a Efí cobra automaticamente no fim
  //            do trial se a pessoa não cancelar antes.
  startImmediately: z.enum(['true', 'false']).default('false'),
})

export type RegisterState = {
  error?: string
  success?: boolean
  waitingPaymentConfirmation?: boolean // true quando pagou na hora (sem trial) e precisa aguardar o webhook confirmar
  email?: string
  password?: string
}

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
    tenantName:       formData.get('tenantName'),
    slug:             formData.get('slug') || undefined,
    name:             formData.get('name'),
    email:            formData.get('email'),
    password:         formData.get('password'),
    billingCycle:     formData.get('billingCycle') || 'MONTHLY',
    cardToken:        formData.get('cardToken'),
    cardholderName:   formData.get('cardholderName'),
    payerCpf:         formData.get('payerCpf'),
    payerPhone:       formData.get('payerPhone'),
    startImmediately: formData.get('startImmediately') || 'false',
  })

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const {
    tenantName, slug: rawSlug, name, email, password, billingCycle,
    cardToken, cardholderName, payerCpf, payerPhone, startImmediately,
  } = parsed.data
  const wantsImmediateAccess = startImmediately === 'true'

  // 1. Email duplicado
  const exists = await prisma.user.findFirst({ where: { email } })
  if (exists) return { error: 'Este email já está cadastrado.' }

  // 2. Slug único
  let slug = rawSlug ?? generateSlug(tenantName)
  const existingSlug = await prisma.tenant.findUnique({ where: { slug } })
  if (existingSlug) slug = `${slug}-${nanoid(4)}`

  const passwordHash = await hashPassword(password)
  const isAnnual     = billingCycle === 'ANNUAL'
  const amount       = isAnnual ? PLAN_PRICE_ANNUAL : PLAN_PRICE_MONTHLY

  // 3. Cartão é OBRIGATÓRIO: valida e cria a assinatura na Efí ANTES de
  // criar qualquer coisa no banco. Se falhar (cartão recusado, dados
  // inválidos, etc.), a conta simplesmente não é criada — decisão de
  // produto, ver conversa com o Helder de 13/07.
  //
  // - wantsImmediateAccess=true  -> sem trial_days, cobra na hora.
  // - wantsImmediateAccess=false -> trial_days: 7, a própria Efí cobra
  //   automaticamente no fim do trial se não for cancelado antes (não
  //   precisa de cron nosso pra isso).
  let efiResult: Awaited<ReturnType<typeof createEfiCardSubscription>>
  try {
    efiResult = await createEfiCardSubscription({
      billingCycle,
      amount,
      planLabel: `Meu Cardápio — Plano PRO ${isAnnual ? 'Anual' : 'Mensal'} — ${tenantName}`,
      customerName: cardholderName,
      customerCpf: onlyDigits(payerCpf),
      customerEmail: email,
      customerPhone: onlyDigits(payerPhone),
      paymentToken: cardToken,
      trialDays: wantsImmediateAccess ? undefined : 7,
    })
  } catch (err) {
    console.error('[register][efi] erro ao validar cartão:', err)
    return { error: 'Não foi possível validar o cartão. Confira os dados e tente novamente.' }
  }

  const now = new Date()
  // Mesma cautela do resto do sistema: se cobra na hora, o status local só
  // vira ACTIVE quando o webhook confirmar 'paid' (por isso PAST_DUE aqui,
  // não ACTIVE otimista). Se é trial, o acesso já é liberado (status
  // TRIAL), a cobrança de verdade só acontece daqui a 7 dias.
  //
  // first_execution é o campo que a própria Efí devolve com a data REAL
  // da primeira cobrança agendada (confirmado com o suporte deles) — usar
  // esse valor em vez de só somar 7 dias na mão evita qualquer divergência
  // entre o que a gente mostra e o que a Efí vai cobrar de verdade.
  const trialEndsAt = efiResult.firstExecution
    ? new Date(`${efiResult.firstExecution}T00:00:00`)
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const periodEnd = wantsImmediateAccess
    ? (() => {
        const d = new Date(now)
        if (isAnnual) d.setFullYear(d.getFullYear() + 1)
        else d.setMonth(d.getMonth() + 1)
        return d
      })()
    : trialEndsAt
  const initialStatus = wantsImmediateAccess ? 'PAST_DUE' : 'TRIAL'

  // 4. Criar tenant, usuário e estrutura inicial
  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug,
          plan: 'PRO',
          subscriptionStatus: initialStatus,
          trialEndsAt: wantsImmediateAccess ? null : trialEndsAt,
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
          status:             initialStatus,
          efiPlanId:          efiResult.efiPlanId,
          efiSubscriptionId:  efiResult.efiSubscriptionId,
          efiChargeId:        efiResult.efiChargeId,
          currentPeriodStart: now,
          currentPeriodEnd:   periodEnd,
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
    waitingPaymentConfirmation: wantsImmediateAccess,
    email,
    password, // necessário para auto-login no cliente
  }
}

