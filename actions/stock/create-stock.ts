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
  // Multi-PDV foi removido (13/07): não pedimos mais isso na tela, o PDV
  // único do tenant é resolvido automaticamente abaixo.
  pdvId:       z.string().optional(),
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

  // Multi-PDV removido: se não veio pdvId (telas novas não mandam mais),
  // busca ou cria o PDV padrão do tenant — mesmo padrão já usado em
  // actions/tables/create-table.ts.
  let pdvId = data.pdvId
  if (!pdvId) {
    let defaultPdv = await prisma.pDV.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } })
    if (!defaultPdv) {
      defaultPdv = await prisma.pDV.create({ data: { tenantId, name: 'Loja Principal', type: 'STORE', isActive: true } })
    }
    pdvId = defaultPdv.id
  }

  // IDOR prevention: produto e PDV precisam pertencer ao mesmo tenant
  const [product, pdv] = await Promise.all([
    prisma.product.findFirst({ where: { id: data.productId, tenantId }, select: { id: true, name: true } }),
    prisma.pDV.findFirst({ where: { id: pdvId, tenantId }, select: { id: true, name: true } }),
  ])
  if (!product) return { error: 'Produto não encontrado' }
  if (!pdv) return { error: 'PDV não encontrado' }

  const existing = await prisma.stock.findUnique({
    where: { pdvId_productId: { pdvId, productId: data.productId } },
  })
  if (existing) return { error: `Já existe controle de estoque para "${product.name}"` }

  const stock = await prisma.stock.create({
    data: {
      tenantId,
      pdvId,
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
        pdvId,
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
    newValue: { productId: data.productId, pdvId, quantity: data.quantity },
  })

  return { ok: true }
}
