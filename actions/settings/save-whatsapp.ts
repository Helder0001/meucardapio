'use server'

// actions/settings/save-whatsapp.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const schema = z.object({
  evolutionUrl: z.string().url('URL inválida'),
  apiKey:       z.string().optional(),
  instanceName: z.string().min(1).max(50),
})

export async function saveWhatsappConfig(data: {
  evolutionUrl: string
  apiKey: string
  instanceName: string
}) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const updateData: Record<string, string> = {
    evolutionUrl: parsed.data.evolutionUrl,
    instanceName: parsed.data.instanceName,
  }

  if (parsed.data.apiKey) {
    updateData.evolutionApiKey = Buffer.from(parsed.data.apiKey).toString('base64')
  }

  await prisma.whatsappConfig.upsert({
    where: { tenantId: session.user.tenantId },
    update: updateData,
    create: {
      tenantId:       session.user.tenantId,
      evolutionUrl:   parsed.data.evolutionUrl,
      evolutionApiKey: parsed.data.apiKey
        ? Buffer.from(parsed.data.apiKey).toString('base64')
        : '',
      instanceName:   parsed.data.instanceName,
      status:         'DISCONNECTED',
    },
  })

  revalidatePath('/dashboard/settings/whatsapp')
  return { ok: true }
}
