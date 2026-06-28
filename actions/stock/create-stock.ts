'use server'

// actions/stock/create-stock.ts
//
// Cadastra o controle de estoque para um produto em um PDV específico.
// Antes disso, o produto é vendido sem nenhum limite (estoque "infinito").
// Depois de cadastrado, toda venda decrementa e toda venda cancelada
// devolve a quantidade (ver lib/utils/stock.ts).

import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { revalidatePath } from 'next/cache'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { z } from 'zod'

const createStockSchema = z.object({
  productId:   z.string().cuid('Produto inválido'),
  pdvId:       z.string().min(1, 'PDV inválido'),
  quantity:    z.coerce.number().min(0, 'Quantidade não pode ser negativa'),
  minQuantity: z.coerce.number().min(0).optional().nullable(),
  unit:        z.string().min(1).max(10).optional(),
})

export type StockFormState = {
  error?: string
  fieldErrors?: Record<string, string[]>
  ok?: boolean
}

export async function createStockAction(
  prevState: StockFormState,
  formData: FormData
): Promise<StockFormState> {
  const session = await auth()
  if (!session?.user?.tenantId) return { error: 'Não autorizado' }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return { error: 'Sem permissão para gerenciar estoque' }
  }

  const tenantId = session.user.tenantId

  const parsed = createStockSchema.safeParse({
    productId:   formData.get('productId'),
    pdvId:       formData.get('pdvId'),
    quantity:    formData.get('quantity'),
    minQuantity: formData.get('minQuantity') || null,
    unit:        formData.get('unit') || undefined,
  })
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }
  const data = parsed.data

  // IDOR prevention: produto e PDV precisam pertencer ao mesmo tenant
  const [product, pdv] = await Promise.all([
    prisma.product.findFirst({ where: { id: data.productId, tenantId }, select: { id: true, name: true } }),
    prisma.pDV.findFirst({ where: { id: data.pdvId, tenantId }, select: { id: true, name: true } }),
  ])
  if (!product) return { error: 'Produto não encontrado' }
  if (!pdv) return { error: 'PDV não encontrado' }

  const existing = await prisma.stock.findUnique({
    where: { pdvId_productId: { pdvId: data.pdvId, productId: data.productId } },
  })
  if (existing) return { error: `Já existe controle de estoque para "${product.name}" neste PDV` }

  const stock = await prisma.stock.create({
    data: {
      tenantId,
      pdvId: data.pdvId,
      productId: data.productId,
      quantity: data.quantity,
      minQuantity: data.minQuantity ?? null,
      unit: data.unit ?? 'UN',
    },
  })

  // Registra a quantidade inicial como um movimento de entrada manual,
  // para que o histórico comece consistente com o saldo cadastrado.
  if (data.quantity > 0) {
    await prisma.stockMovement.create({
      data: {
        tenantId,
        stockId: stock.id,
        productId: data.productId,
        pdvId: data.pdvId,
        type: 'MANUAL_IN',
        quantity: data.quantity,
        balanceAfter: data.quantity,
        userId: session.user.id,
        reason: 'Estoque inicial',
      },
    })
  }

  revalidatePath('/dashboard/stock')

  await auditLog({
    tenantId,
    userId: session.user.id,
    action: AuditActions.STOCK_CREATED,
    resource: 'stock',
    resourceId: stock.id,
    newValue: { productId: data.productId, pdvId: data.pdvId, quantity: data.quantity },
  })

  return { ok: true }
}
