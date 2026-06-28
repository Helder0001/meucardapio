'use server'

// actions/stock/adjust-stock.ts
//
// Ajuste manual de estoque feito pelo lojista no dashboard:
//   - MANUAL_IN:   entrada de mercadoria (compra, reposição)
//   - MANUAL_OUT:  saída sem venda (perda, quebra, validade)
//   - ADJUSTMENT:  corrige o saldo para um valor exato (inventário físico)
//
// Toda mudança de quantidade passa por adjustStockManually(), que grava
// um StockMovement — histórico auditável de tudo que entrou/saiu.

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { adjustStockManually, revalidateStorefrontForTenant } from '@/lib/utils/stock'
import { z } from 'zod'

const adjustSchema = z.object({
  stockId:  z.string().min(1, 'Estoque inválido'),
  type:     z.enum(['MANUAL_IN', 'MANUAL_OUT', 'ADJUSTMENT']),
  quantity: z.coerce.number().min(0, 'Quantidade não pode ser negativa'),
  reason:   z.string().max(200).optional(),
})

export type AdjustStockState = {
  error?: string
  fieldErrors?: Record<string, string[]>
  ok?: boolean
  quantity?: number
}

export async function adjustStockAction(
  prevState: AdjustStockState,
  formData: FormData
): Promise<AdjustStockState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return { error: 'Sem permissão para gerenciar estoque' }
  }

  const tenantId = session.user.tenantId

  const parsed = adjustSchema.safeParse({
    stockId:  formData.get('stockId'),
    type:     formData.get('type'),
    quantity: formData.get('quantity'),
    reason:   formData.get('reason') || undefined,
  })
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }
  const data = parsed.data

  // IDOR prevention: o registro de estoque precisa pertencer ao tenant
  const stock = await prisma.stock.findFirst({
    where: { id: data.stockId, tenantId },
    select: { id: true, quantity: true, product: { select: { name: true } } },
  })
  if (!stock) return { error: 'Registro de estoque não encontrado' }

  let result: { quantity: number; productId: string }
  try {
    result = await prisma.$transaction((tx) =>
      adjustStockManually(tx, {
        tenantId,
        stockId: data.stockId,
        type: data.type,
        quantity: data.quantity,
        userId: session.user.id,
        reason: data.reason,
      })
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao ajustar estoque' }
  }

  revalidatePath('/dashboard/stock')
  // O ajuste pode ter zerado ou repovoado o produto — revalida o cardápio
  // digital pra refletir isso sem esperar o ISR de 60s.
  await revalidateStorefrontForTenant(tenantId)

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.STOCK_ADJUSTED,
    resource: 'stock',
    resourceId: data.stockId,
    oldValue: { quantity: Number(stock.quantity) },
    newValue: { quantity: result.quantity, type: data.type, reason: data.reason },
  })

  return { ok: true, quantity: result.quantity }
}
