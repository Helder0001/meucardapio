'use server'

// actions/printers/manage-printers.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const schema = z.object({
  name:   z.string().min(1).max(50),
  sector: z.enum(['KITCHEN', 'BAR', 'COUNTER']),
})

export async function createPrinterAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const parsed = schema.safeParse({
    name:   formData.get('name'),
    sector: formData.get('sector'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  // Token único e seguro
  const token = nanoid(32)

  await prisma.printer.create({
    data: {
      tenantId: session.user.tenantId,
      token,
      ...parsed.data,
    },
  })

  revalidatePath('/dashboard/printers')
  return { ok: true }
}

export async function deletePrinterAction(printerId: string) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const printer = await prisma.printer.findFirst({
    where: { id: printerId, tenantId: session.user.tenantId },
  })
  if (!printer) return { error: 'Impressora não encontrada' }

  await prisma.printer.update({
    where: { id: printerId },
    data: { isActive: false },
  })

  revalidatePath('/dashboard/printers')
  return { ok: true }
}
