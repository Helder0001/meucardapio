'use server'
// actions/tables/create-table.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const tableSchema = z.object({
  pdvId:    z.string().optional(),
  number:   z.coerce.number().int().positive('Número inválido'),
  sector:   z.string().min(1).max(50).default('Principal'),
  capacity: z.coerce.number().int().positive().default(4),
})

export async function createTableAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const tenantId = session.user.tenantId

  const parsed = tableSchema.safeParse({
    pdvId:    formData.get('pdvId') || undefined,
    number:   formData.get('number'),
    sector:   formData.get('sector') || 'Principal',
    capacity: formData.get('capacity') || 4,
  })

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  // Se não informou pdvId, buscar ou criar o PDV padrão do tenant
  let pdvId = parsed.data.pdvId
  if (!pdvId) {
    let defaultPdv = await prisma.pDV.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    })
    if (!defaultPdv) {
      defaultPdv = await prisma.pDV.create({
        data: { tenantId, name: 'Principal', isActive: true },
      })
    }
    pdvId = defaultPdv.id
  } else {
    const pdv = await prisma.pDV.findFirst({ where: { id: pdvId, tenantId } })
    if (!pdv) return { error: 'PDV inválido' }
  }

  // Verificar se número já existe
  const existing = await prisma.table.findFirst({
    where: { pdvId, number: parsed.data.number },
  })
  if (existing) {
    return { error: `Mesa ${parsed.data.number} já existe neste setor` }
  }

  // Gerar QR Code token único
  let qrCode = nanoid(16)
  while (await prisma.table.findFirst({ where: { qrCode } })) {
    qrCode = nanoid(16)
  }

  await prisma.table.create({
    data: {
      tenantId,
      pdvId,
      number:   parsed.data.number,
      sector:   parsed.data.sector,
      capacity: parsed.data.capacity,
      qrCode,
    },
  })

  revalidatePath('/dashboard/tables')
  return { ok: true }
}
