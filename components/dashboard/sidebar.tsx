'use client'

// components/dashboard/sidebar.tsx

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Users, Table2,
  Truck, BarChart3, Settings, Tag, Star, MessageSquare, Printer,
  ChevronLeft, ChevronRight, Store, QrCode, ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: number
  minPlan?: 'PRO' | 'PREMIUM'
  // Se definido, apenas essas roles podem ver o item. Se omitido → todos.
  allowedRoles?: string[]
}

// CORREÇÃO:
// - WhatsApp apontava para /dashboard/whatsapp (rota inexistente) → corrigido
//   para /dashboard/settings/whatsapp, que é a página real. Era a causa do
//   erro "Página não encontrada" ao clicar em WhatsApp.
// - Multi-PDV apontava para /dashboard/pdv (página não existia) → página
//   criada. Exigência de plano reduzida de PREMIUM para PRO, já que o plano
//   Premium foi removido da oferta.
const ADMIN_ROLES  = ['TENANT_ADMIN']
const MANAGER_UP   = ['TENANT_ADMIN', 'MANAGER']
const ATTENDANT_UP = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT']
const ORDERS_ROLES = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF', 'DELIVERY_PERSON']

const navItems: NavItem[] = [
  // Dashboard — só Admins e Gerentes (outros começam no Kanban)
  { label: 'Dashboard',    href: '/dashboard',                    icon: LayoutDashboard,
    allowedRoles: MANAGER_UP },
  // Pedidos e Kanban — todos os roles operacionais
  { label: 'Pedidos',      href: '/dashboard/orders',             icon: ShoppingBag,
    allowedRoles: ORDERS_ROLES },
  { label: 'Kanban',       href: '/dashboard/orders/kanban',      icon: LayoutDashboard,
    allowedRoles: ORDERS_ROLES },
  // Cardápio
  { label: 'Cardápio',     href: '/dashboard/menu/products',      icon: UtensilsCrossed,
    allowedRoles: MANAGER_UP },
  { label: 'Categorias',   href: '/dashboard/menu/categories',    icon: UtensilsCrossed,
    allowedRoles: MANAGER_UP },
  { label: 'Adicionais',   href: '/dashboard/menu/addons',        icon: UtensilsCrossed,
    allowedRoles: MANAGER_UP },
  { label: 'Mesas',        href: '/dashboard/tables',             icon: Table2,
    allowedRoles: MANAGER_UP },
  { label: 'Clientes',     href: '/dashboard/customers',          icon: Users,
    allowedRoles: MANAGER_UP },
  { label: 'Permissões',   href: '/dashboard/users',              icon: ShieldCheck,
    allowedRoles: ADMIN_ROLES },
  { label: 'Delivery',     href: '/dashboard/delivery',           icon: Truck,       minPlan: 'PRO',
    allowedRoles: MANAGER_UP },
  { label: 'Cupons',       href: '/dashboard/coupons',            icon: Tag,         minPlan: 'PRO',
    allowedRoles: MANAGER_UP },
  { label: 'Fidelidade',   href: '/dashboard/loyalty',            icon: Star,        minPlan: 'PRO',
    allowedRoles: MANAGER_UP },
  { label: 'WhatsApp',     href: '/dashboard/settings/whatsapp',  icon: MessageSquare, minPlan: 'PRO',
    allowedRoles: MANAGER_UP },
  { label: 'Multi-PDV',    href: '/dashboard/pdv',                icon: Store,       minPlan: 'PRO',
    allowedRoles: MANAGER_UP },
  { label: 'Avaliações',   href: '/dashboard/reviews',            icon: Star,
    allowedRoles: MANAGER_UP },
  { label: 'Relatórios',   href: '/dashboard/reports',            icon: BarChart3,
    allowedRoles: MANAGER_UP },
  { label: 'Impressoras',  href: '/dashboard/printers',           icon: Printer,
    allowedRoles: MANAGER_UP },
  { label: 'Pagamentos',   href: '/dashboard/settings/payments',  icon: QrCode,
    allowedRoles: MANAGER_UP },
  // Configurações — só Admin (não Atendente, não Gerente de piso)
  { label: 'Configurações',href: '/dashboard/settings',           icon: Settings,
    allowedRoles: ADMIN_ROLES },
]

interface SidebarProps {
  userRole: string
  tenantSlug: string
  plan: string
}

const PLAN_ORDER = { STARTER: 0, PRO: 1, PREMIUM: 2 }

export function Sidebar({ userRole, tenantSlug, plan }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const userPlanLevel = PLAN_ORDER[plan as keyof typeof PLAN_ORDER] ?? 0

  const canAccess = (item: NavItem) => {
    if (!item.minPlan) return true
    return userPlanLevel >= PLAN_ORDER[item.minPlan]
  }

  const canSee = (item: NavItem) => {
    if (!item.allowedRoles) return true
    return item.allowedRoles.includes(userRole)
  }

  return (
    <aside className={cn(
      'flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo — CORREÇÃO: marca "Meu Cardápio" + logo enviada pelo cliente */}
      <div className={cn('flex items-center h-16 px-4 border-b border-border', collapsed ? 'justify-center' : 'gap-3')}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-primary">
          <Image
            src="/logo-icon.png"
            alt="Meu Cardápio"
            width={32}
            height={32}
            className="object-cover w-full h-full"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement
              el.style.display = 'none'
              el.nextElementSibling?.classList.remove('hidden')
            }}
          />
          <span className="hidden text-primary-foreground font-bold text-sm">M</span>
        </div>
        {!collapsed && <span className="font-semibold text-foreground">Meu Cardápio</span>}
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {navItems.map((item) => {
          if (!canSee(item)) return null

          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          const accessible = canAccess(item)
          const Icon = item.icon

          if (!accessible) {
            return (
              <div key={item.href} title={`Disponível no plano ${item.minPlan}`}
                className={cn('flex items-center gap-3 px-3 py-2 rounded-md opacity-40 cursor-not-allowed', collapsed && 'justify-center')}>
                <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                {!collapsed && <span className="text-sm text-muted-foreground">{item.label}</span>}
              </div>
            )
          }

          return (
            <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                collapsed && 'justify-center',
                isActive ? 'bg-primary text-primary-foreground font-medium'
                         : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}>
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge && item.badge > 0 && (
                <span className="ml-auto text-xs bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Badge de modo para roles operacionais */}
      {!collapsed && !['TENANT_ADMIN', 'MASTER_ADMIN'].includes(userRole) && (() => {
        const modeLabel: Record<string, string> = {
          MANAGER:         '👔 Modo Gerente',
          ATTENDANT:       '🧾 Modo Atendente',
          STAFF:           '🍽️ Modo Operador',
          DELIVERY_PERSON: '🛵 Modo Entregador',
        }
        const label = modeLabel[userRole]
        if (!label) return null
        return (
          <div className="px-4 py-2 border-t border-border">
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {label}
            </span>
          </div>
        )
      })()}

      {/* Plano atual — só Admin e Gerente */}
      {!collapsed && ['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(userRole) && (
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Plano</span>
            <span className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              plan === 'STARTER' && 'bg-muted text-muted-foreground',
              plan === 'PRO'     && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
              plan === 'PREMIUM' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
            )}>{plan}</span>
          </div>
        </div>
      )}

      <button onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  )
}
