// lib/auth/permissions.ts
//
// RBAC (Role-Based Access Control)
//
// Hierarquia de permissões (maior número = mais poder):
// MASTER_ADMIN (100) > TENANT_ADMIN (80) > MANAGER (60) > ATTENDANT (40) > WAITER (20) > DELIVERY_PERSON (10)
//
// Uso nas Server Actions:
//   await requireRole(session, 'MANAGER')
//   await requireTenantAccess(session, tenantId)

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export type UserRole =
  | 'MASTER_ADMIN'
  | 'TENANT_ADMIN'
  | 'MANAGER'
  | 'ATTENDANT'
  | 'WAITER'
  | 'DELIVERY_PERSON'

const ROLE_LEVEL: Record<UserRole, number> = {
  MASTER_ADMIN: 100,
  TENANT_ADMIN: 80,
  MANAGER: 60,
  ATTENDANT: 40,
  WAITER: 20,
  DELIVERY_PERSON: 10,
}

// O que cada role pode fazer
export const PERMISSIONS = {
  // Pedidos
  'orders:create': ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'WAITER'],
  'orders:view': ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'WAITER'],
  'orders:cancel': ['TENANT_ADMIN', 'MANAGER'],
  'orders:refund': ['TENANT_ADMIN', 'MANAGER'],

  // Produtos
  'products:create': ['TENANT_ADMIN', 'MANAGER'],
  'products:update': ['TENANT_ADMIN', 'MANAGER'],
  'products:delete': ['TENANT_ADMIN'],

  // Usuários
  'users:create': ['TENANT_ADMIN'],
  'users:update': ['TENANT_ADMIN'],
  'users:delete': ['TENANT_ADMIN'],

  // Relatórios
  'reports:view': ['TENANT_ADMIN', 'MANAGER'],
  'reports:export': ['TENANT_ADMIN', 'MANAGER'],

  // Configurações
  'settings:update': ['TENANT_ADMIN'],

  // Financeiro
  'payments:view': ['TENANT_ADMIN', 'MANAGER'],
  'cashflow:manage': ['TENANT_ADMIN', 'MANAGER'],

  // Master
  'master:access': ['MASTER_ADMIN'],
  'tenants:manage': ['MASTER_ADMIN'],
} as const

export type Permission = keyof typeof PERMISSIONS

// Verifica se um role tem determinada permissão
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly string[]
  return allowed.includes(role)
}

// Verifica se um role tem nível >= ao role mínimo exigido
export function hasRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[minRole]
}

// Usa em Server Actions: lança redirect se não autorizado
export async function requireAuth() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return session
}

export async function requireRole(minRole: UserRole) {
  const session = await requireAuth()
  if (!hasRole(session.user.role as UserRole, minRole)) {
    redirect('/dashboard')
  }
  return session
}

export async function requirePermission(permission: Permission) {
  const session = await requireAuth()
  if (!hasPermission(session.user.role as UserRole, permission)) {
    redirect('/dashboard')
  }
  return session
}

// Garante que o usuário acessa apenas seu próprio tenant
export async function requireTenantAccess(tenantId: string) {
  const session = await requireAuth()

  // MASTER_ADMIN pode acessar qualquer tenant
  if (session.user.role === 'MASTER_ADMIN') return session

  // Outros usuários: verificar se o tenantId bate
  if (session.user.tenantId !== tenantId) {
    redirect('/dashboard')
  }

  return session
}
