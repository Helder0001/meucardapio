// app/api/products/[id]/route.ts

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!['TENANT_ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params

  // Verificar se o produto pertence ao tenant
  const product = await prisma.product.findFirst({
    where: { id, tenantId: session.user.tenantId },
  })

  if (!product) {
    return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })
  }

  // Verificar se tem pedidos vinculados
  const ordersCount = await prisma.orderItem.count({
    where: { productId: id },
  })

  if (ordersCount > 0) {
    // Ao invés de excluir, apenas desativa o produto
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    })
    return NextResponse.json({
      warning: 'Produto possui pedidos vinculados e foi desativado ao invés de excluído.',
    })
  }

  await prisma.product.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
