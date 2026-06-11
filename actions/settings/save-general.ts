'use server'
// actions/settings/save-general.ts
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { invalidateMenu } from '@/lib/cache/redis'
import { z } from 'zod'

const schema = z.object({
  name:           z.string().min(2).max(100),
  phone:          z.string().optional(),
  email:          z.string().email().optional().or(z.literal('')),
  cnpj:           z.string().optional(),
  primaryColor:   z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  manualOpen:     z.enum(['true','false','']).optional(),
  closedMessage:  z.string().max(200).optional(),
  tagline:        z.string().max(200).optional(),
  coverImage:     z.string().url().optional().or(z.literal('')),
  logo:           z.string().url().optional().or(z.literal('')),
  instagram:      z.string().max(100).optional(),
  address:        z.string().max(300).optional(),
  acceptedPayments: z.string().optional(), // JSON array
})

export type SettingsState = { error?: string; success?: boolean }

export async function saveGeneralSettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const tenantId = session.user.tenantId

  const raw = {
    name:             formData.get('name'),
    phone:            formData.get('phone') || undefined,
    email:            formData.get('email') || undefined,
    cnpj:             formData.get('cnpj')  || undefined,
    primaryColor:     formData.get('primaryColor') || undefined,
    manualOpen:       formData.get('manualOpen') || '',
    closedMessage:    formData.get('closedMessage') || undefined,
    tagline:          formData.get('tagline') || undefined,
    coverImage:       formData.get('coverImage') || undefined,
    logo:             formData.get('logo') || undefined,
    instagram:        formData.get('instagram') || undefined,
    address:          formData.get('address') || undefined,
    acceptedPayments: formData.get('acceptedPayments') || undefined,
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const businessHours: { dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }[] = []
  for (let day = 0; day <= 6; day++) {
    const isOpen    = formData.get(`day_${day}_open`) === 'on'
    const openTime  = (formData.get(`day_${day}_open_time`) as string) || '11:00'
    const closeTime = (formData.get(`day_${day}_close_time`) as string) || '23:00'
    businessHours.push({ dayOfWeek: day, isOpen, openTime, closeTime })
  }

  const manualOpenValue =
    parsed.data.manualOpen === 'true'  ? true  :
    parsed.data.manualOpen === 'false' ? false : null

  // Parse accepted payments
  let acceptedPayments: string[] = []
  try {
    if (parsed.data.acceptedPayments) {
      acceptedPayments = JSON.parse(parsed.data.acceptedPayments)
    }
  } catch {}

  const current = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { settings: true },
  })

  const currentSettings = (current?.settings ?? {}) as Record<string, unknown>
  const newSettings: Record<string, unknown> = {
    ...currentSettings,
    manualOpen:       manualOpenValue,
    closedMessage:    parsed.data.closedMessage ?? currentSettings.closedMessage,
    tagline:          parsed.data.tagline ?? currentSettings.tagline,
    coverImage:       parsed.data.coverImage || currentSettings.coverImage,
    instagram:        parsed.data.instagram ? `@${parsed.data.instagram.replace('@', '')}` : currentSettings.instagram,
    address:          parsed.data.address ?? currentSettings.address,
    acceptedPayments: acceptedPayments.length > 0 ? acceptedPayments : currentSettings.acceptedPayments,
    // Incluir horários no settings para exibição no cardápio
    businessHoursDisplay: businessHours,
  }

  // Remover campos vazios (strings vazias)
  if (!parsed.data.coverImage) delete newSettings.coverImage
  if (!parsed.data.instagram) {} // manter como está

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        name:         parsed.data.name,
        phone:        parsed.data.phone ?? null,
        email:        parsed.data.email || null,
        cnpj:         parsed.data.cnpj  ?? null,
        primaryColor: parsed.data.primaryColor ?? null,
        // Logo atualizado se fornecido
        ...(parsed.data.logo ? { logo: parsed.data.logo } : {}),
        settings:     newSettings as any,
      },
    })
    for (const hour of businessHours) {
      await tx.businessHour.upsert({
        where: { tenantId_dayOfWeek: { tenantId, dayOfWeek: hour.dayOfWeek } },
        update: { isOpen: hour.isOpen, openTime: hour.openTime, closeTime: hour.closeTime },
        create: { tenantId, ...hour },
      })
    }
  })

  await invalidateMenu(tenantId)
  revalidatePath('/dashboard/settings')
  return { success: true }
}
