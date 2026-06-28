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
// Com plano único PRO, qualquer tenant com assinatura ativa tem acesso total
export function canUsePlan(
  _tenantPlan: string,
  _requiredPlan: 'STARTER' | 'PRO' | 'PREMIUM'
): boolean {
  return true
}

// Verifica limite de produtos pelo plano
// Plano PRO: sem limite de produtos
export async function checkProductLimit(_tenantId: string, _plan: string): Promise<boolean> {
  return true
}

// Verifica limite de usuários pelo plano
// Plano PRO: sem limite de usuários
export async function checkUserLimit(_tenantId: string, _plan: string): Promise<boolean> {
  return true
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
