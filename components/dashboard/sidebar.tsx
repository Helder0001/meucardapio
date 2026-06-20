'use client'

// components/dashboard/sidebar.tsx

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Users, Table2,
  Truck, BarChart3, Settings, Tag, Star, MessageSquare, Printer,
  Store, QrCode, ShieldCheck, X, Menu,
  Bell, ClipboardList,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: number
  minPlan?: 'PRO' | 'PREMIUM'
  allowedRoles?: string[]
}

const ADMIN_ROLES  = ['TENANT_ADMIN']
const MANAGER_UP   = ['TENANT_ADMIN', 'MANAGER']
const ORDERS_ROLES = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF', 'DELIVERY_PERSON']

const navItems: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',                    icon: LayoutDashboard,   allowedRoles: MANAGER_UP },
  { label: 'Pedidos',      href: '/dashboard/orders',             icon: ShoppingBag,       allowedRoles: ORDERS_ROLES },
  { label: 'Kanban',       href: '/dashboard/orders/kanban',      icon: ClipboardList,     allowedRoles: ORDERS_ROLES },
  { label: 'Cardápio',     href: '/dashboard/menu/products',      icon: UtensilsCrossed,   allowedRoles: MANAGER_UP },
  { label: 'Categorias',   href: '/dashboard/menu/categories',    icon: UtensilsCrossed,   allowedRoles: MANAGER_UP },
  { label: 'Adicionais',   href: '/dashboard/menu/addons',        icon: UtensilsCrossed,   allowedRoles: MANAGER_UP },
  { label: 'Mesas',        href: '/dashboard/tables',             icon: Table2,            allowedRoles: MANAGER_UP },
  { label: 'Clientes',     href: '/dashboard/customers',          icon: Users,             allowedRoles: MANAGER_UP },
  { label: 'Permissões',   href: '/dashboard/users',              icon: ShieldCheck,       allowedRoles: ADMIN_ROLES },
  { label: 'Delivery',     href: '/dashboard/delivery',           icon: Truck,             minPlan: 'PRO', allowedRoles: MANAGER_UP },
  { label: 'Cupons',       href: '/dashboard/coupons',            icon: Tag,               minPlan: 'PRO', allowedRoles: MANAGER_UP },
  { label: 'Fidelidade',   href: '/dashboard/loyalty',            icon: Star,              minPlan: 'PRO', allowedRoles: MANAGER_UP },
  { label: 'WhatsApp',     href: '/dashboard/settings/whatsapp',  icon: MessageSquare,     minPlan: 'PRO', allowedRoles: MANAGER_UP },
  { label: 'Multi-PDV',    href: '/dashboard/pdv',                icon: Store,             minPlan: 'PRO', allowedRoles: MANAGER_UP },
  { label: 'Avaliações',   href: '/dashboard/reviews',            icon: Star,              allowedRoles: MANAGER_UP },
  { label: 'Relatórios',   href: '/dashboard/reports',            icon: BarChart3,         allowedRoles: MANAGER_UP },
  { label: 'Impressoras',  href: '/dashboard/printers',           icon: Printer,           allowedRoles: MANAGER_UP },
  { label: 'Pagamentos',   href: '/dashboard/settings/payments',  icon: QrCode,            allowedRoles: MANAGER_UP },
  { label: 'Configurações',href: '/dashboard/settings',           icon: Settings,          allowedRoles: ADMIN_ROLES },
]

// Bottom nav items for mobile (most important 4)
const bottomNavItems = (userRole: string) => {
  const isOp = ['STAFF', 'DELIVERY_PERSON', 'ATTENDANT'].includes(userRole)
  if (isOp) return [
    { label: 'Pedidos',  href: '/dashboard/orders',          icon: ShoppingBag },
    { label: 'Kanban',   href: '/dashboard/orders/kanban',   icon: ClipboardList },
  ]
  return [
    { label: 'Início',   href: '/dashboard',                 icon: LayoutDashboard },
    { label: 'Pedidos',  href: '/dashboard/orders',          icon: ShoppingBag },
    { label: 'Kanban',   href: '/dashboard/orders/kanban',   icon: ClipboardList },
    { label: 'Relatórios', href: '/dashboard/reports',       icon: BarChart3 },
  ]
}

const PLAN_ORDER: Record<string, number> = { STARTER: 0, PRO: 1, PREMIUM: 2 }

interface SidebarProps {
  userRole: string
  tenantSlug: string
  plan: string
}

export function Sidebar({ userRole, tenantSlug, plan }: SidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const userPlanLevel = PLAN_ORDER[plan as keyof typeof PLAN_ORDER] ?? 0

  // Close drawer on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const canAccess = (item: NavItem) => {
    if (!item.minPlan) return true
    return userPlanLevel >= PLAN_ORDER[item.minPlan]
  }
  const canSee = (item: NavItem) => {
    if (!item.allowedRoles) return true
    return item.allowedRoles.includes(userRole)
  }

  const NavList = () => (
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
      {navItems.map((item) => {
        if (!canSee(item)) return null
        const isActive = pathname === item.href ||
          (item.href !== '/dashboard' && pathname.startsWith(item.href))
        const accessible = canAccess(item)
        const Icon = item.icon

        if (!accessible) return (
          <div key={item.href} title={`Disponível no plano ${item.minPlan}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-40 cursor-not-allowed">
            <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{item.label}</span>
          </div>
        )

        return (
          <Link key={item.href} href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all',
              isActive
                ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}>
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span>{item.label}</span>
            {item.badge && item.badge > 0 && (
              <span className="ml-auto text-xs bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                {item.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )

  const modeLabel: Record<string, string> = {
    MANAGER: '👔 Modo Gerente', ATTENDANT: '🧾 Modo Atendente',
    STAFF: '🍽️ Modo Operador', DELIVERY_PERSON: '🛵 Modo Entregador',
  }
  const mode = modeLabel[userRole]

  const bottomItems = bottomNavItems(userRole)

  return (
    <>
      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 h-16 px-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-primary">
            <Image src="/logo-icon.png" alt="Meu Cardápio" width={32} height={32} className="object-cover w-full h-full"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement
                el.style.display = 'none'
                el.nextElementSibling?.classList.remove('hidden')
              }} />
            <span className="hidden text-primary-foreground font-bold text-sm">M</span>
          </div>
          <span className="font-semibold text-foreground">Meu Cardápio</span>
        </div>

        <NavList />

        {/* Role badge */}
        {mode && (
          <div className="px-4 py-3 border-t border-border">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {mode}
            </span>
          </div>
        )}

        {/* Plan */}
        {['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(userRole) && (
          <div className="px-4 py-3 border-t border-border">
            <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full',
              plan === 'PRO' || plan === 'PREMIUM'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-muted text-muted-foreground')}>
              {plan === 'PRO' ? '⚡ Plano Pro' : plan === 'PREMIUM' ? '👑 Premium' : '🆓 Starter'}
            </span>
          </div>
        )}
      </aside>

      {/* ── MOBILE DRAWER OVERLAY ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-primary">
                  <Image src="/logo-icon.png" alt="" width={32} height={32} className="object-cover w-full h-full"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none' }} />
                </div>
                <span className="font-semibold text-foreground">Meu Cardápio</span>
              </div>
              <button onClick={() => setMobileOpen(false)}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <NavList />

            {mode && (
              <div className="px-4 py-3 border-t border-border">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {mode}
                </span>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* ── MOBILE BOTTOM NAV ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-card border-t border-border shadow-lg"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center">
          {/* Hamburger to open full menu */}
          <button onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 text-muted-foreground hover:text-foreground transition-colors">
            <Menu className="h-5 w-5" />
            <span className="text-[10px] font-medium">Menu</span>
          </button>

          {bottomItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 transition-colors',
                  isActive ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
                )}>
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
