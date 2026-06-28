'use server'

// actions/stock/update-min-quantity.ts
// Atualiza o limiar de "estoque baixo" (minQuantity) usado por
// lib/utils/stock-alerts.ts para disparar notificações no dashboard.

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const schema = z.object({
  stockId:     z.string().min(1),
  minQuantity: z.coerce.number().min(0).optional().nullable(),
})

export async function updateMinQuantityAction(input: {
  stockId: string
  minQuantity: number | null
}): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return { error: 'Sem permissão para gerenciar estoque' }
  }

  const tenantId = session.user.tenantId
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const stock = await prisma.stock.findFirst({
    where: { id: parsed.data.stockId, tenantId },
    select: { id: true },
  })
  if (!stock) return { error: 'Registro de estoque não encontrado' }

  await prisma.stock.update({
    where: { id: stock.id },
    data: { minQuantity: parsed.data.minQuantity },
  })

  revalidatePath('/dashboard/stock')
  return { ok: true }
}
