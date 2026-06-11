// lib/db/tenant.ts
//
// SEGURANÇA CRÍTICA: Isolamento de tenant.
//
// Toda query que acessa dados de um estabelecimento DEVE usar estas funções.
// Elas garantem que o tenantId está sempre no WHERE, prevenindo vazamento
// de dados entre estabelecimentos (IDOR - Insecure Direct Object Reference).
//
// Uso correto:
//   const order = await getTenantResource('order', orderId, tenantId)
//
// Uso ERRADO (nunca fazer):
//   const order = await prisma.order.findUnique({ where: { id: orderId } })

import { prisma } from './client'
import { Prisma } from '@prisma/client'

// Verifica se um recurso pertence ao tenant antes de retorná-lo
export async function getTenantResource<T>(
  model: string,
  id: string,
  tenantId: string
): Promise<T | null> {
  // @ts-ignore - acesso dinâmico ao modelo do Prisma
  const resource = await prisma[model].findFirst({
    where: { id, tenantId },
  })
  return resource
}

// Verifica se um tenant existe e está ativo
export async function getTenantBySlug(slug: string) {
  return prisma.tenant.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      customDomain: true,
      plan: true,
      subscriptionStatus: true,
      logo: true,
      primaryColor: true,
      secondaryColor: true,
      phone: true,
      settings: true,
    },
  })
}

export async function getTenantById(id: string) {
  return prisma.tenant.findFirst({
    where: { id, isActive: true },
  })
}

// Verifica se o tenant está com assinatura válida para acessar um recurso
export function canUsePlan(
  tenantPlan: string,
  requiredPlan: 'STARTER' | 'PRO' | 'PREMIUM'
): boolean {
  const planOrder = { STARTER: 0, PRO: 1, PREMIUM: 2 }
  return planOrder[tenantPlan as keyof typeof planOrder] >= planOrder[requiredPlan]
}

// Verifica limite de produtos pelo plano
export async function checkProductLimit(tenantId: string, plan: string): Promise<boolean> {
  if (plan !== 'STARTER') return true // PRO e PREMIUM sem limite

  const count = await prisma.product.count({
    where: { tenantId, isActive: true },
  })
  return count < 50
}

// Verifica limite de usuários pelo plano
export async function checkUserLimit(tenantId: string, plan: string): Promise<boolean> {
  const limits = { STARTER: 1, PRO: 5, PREMIUM: Infinity }
  const limit = limits[plan as keyof typeof limits] ?? 1

  if (limit === Infinity) return true

  const count = await prisma.user.count({
    where: { tenantId, isActive: true },
  })
  return count < limit
}

// Gera próximo número de pedido para o tenant (sequencial por tenant)
export async function getNextOrderNumber(tenantId: string): Promise<number> {
  const lastOrder = await prisma.order.findFirst({
    where: { tenantId },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  })
  return (lastOrder?.orderNumber ?? 0) + 1
}
