'use server'

// actions/products/toggle-active.ts

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { invalidateMenu } from '@/lib/cache/redis'
import { auditLog, AuditActions } from '@/lib/utils/audit'

export async function toggleProductActive(productId: string, active: boolean) {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }

  const tenantId = session.user.tenantId

  // Verificar que o produto pertence ao tenant (IDOR prevention)
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: { id: true, name: true, isActive: true },
  })

  if (!product) return { error: 'Produto não encontrado' }

  await prisma.product.update({
    where: { id: productId },
    data: { isActive: active },
  })

  // Invalidar cache do cardápio para este tenant
  await invalidateMenu(tenantId)

  // Revalidar as páginas do dashboard e storefront
  revalidatePath('/dashboard/menu/products')
  revalidatePath(`/menu`)

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: active ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
    resource: 'products',
    resourceId: productId,
    oldValue: { isActive: !active },
    newValue: { isActive: active },
  })

  return { ok: true }
}
