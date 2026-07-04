'use server'
// actions/tables/delete-table.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'

export async function deleteTableAction(tableId: string) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) return { error: 'Sem permissão' }

  const tenantId = session.user.tenantId

  const table = await prisma.table.findFirst({
    where: { id: tableId, tenantId },
    select: { id: true, status: true, number: true },
  })

  if (!table) return { error: 'Mesa não encontrada' }

  if (table.status === 'OCCUPIED') {
    return { error: `Mesa ${table.number} está ocupada e não pode ser excluída` }
  }

  await prisma.table.delete({ where: { id: tableId } })

  revalidatePath('/dashboard/tables')
  return { ok: true }
}
