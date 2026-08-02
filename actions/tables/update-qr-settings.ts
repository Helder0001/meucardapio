'use server'

// actions/tables/update-qr-settings.ts

import { prisma } from '@/lib/db/client'
import { auth } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'

export async function updateTableQrViewOnlyAction(viewOnly: boolean): Promise<{ error?: string; success?: boolean }> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Sessão inválida.' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return { error: 'Apenas administradores e gerentes podem alterar essa configuração.' }
  }

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { tableQrViewOnly: viewOnly },
  })

  revalidatePath('/dashboard/tables')
  return { success: true }
}
