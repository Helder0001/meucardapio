'use client'

// components/dashboard/sidebar.tsx

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Users, Table2,
  Truck, BarChart3, Settings, Tag, Star, MessageSquare, MessageCircle, Printer,
  QrCode, ShieldCheck, X, Menu,
  Bell, ClipboardList, Boxes, Plug, Bot,
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
  comingSoon?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const ADMIN_ROLES  = ['TENANT_ADMIN']
const MANAGER_UP   = ['TENANT_ADMIN', 'MANAGER']
const ORDERS_ROLES = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF', 'DELIVERY_PERSON']

// Antes uma lista única de 22 itens sem hierarquia — agrupado por área
// de uso pra ficar mais fácil de escanear visualmente.
const navSections: NavSection[] = [
  {
    label: 'Operação',
    items: [
      { label: 'Dashboard', href: '/dashboard',               icon: LayoutDashboard, allowedRoles: MANAGER_UP },
      { label: 'Pedidos',   href: '/dashboard/orders',        icon: ShoppingBag,     allowedRoles: ORDERS_ROLES },
      { label: 'Kanban',    href: '/dashboard/orders/kanban', icon: ClipboardList,   allowedRoles: ORDERS_ROLES },
      { label: 'Minhas Entregas', href: '/dashboard/delivery/tracking', icon: Truck, allowedRoles: ['DELIVERY_PERSON', ...MANAGER_UP] },
      { label: 'Mesas',     href: '/dashboard/tables',        icon: Table2,          allowedRoles: MANAGER_UP },
      { label: 'Delivery',  href: '/dashboard/delivery',      icon: Truck,           minPlan: 'PRO', allowedRoles: MANAGER_UP },
    ],
  },
  {
    label: 'Cardápio',
    items: [
      { label: 'Produtos',    href: '/dashboard/menu/products',   icon: UtensilsCrossed, allowedRoles: MANAGER_UP },
      { label: 'Categorias',  href: '/dashboard/menu/categories', icon: UtensilsCrossed, allowedRoles: MANAGER_UP },
      { label: 'Adicionais',  href: '/dashboard/menu/addons',     icon: UtensilsCrossed, allowedRoles: MANAGER_UP },
      { label: 'Estoque',     href: '/dashboard/stock',           icon: Boxes,           allowedRoles: MANAGER_UP },
    ],
  },
  {
    label: 'Clientes & Marketing',
    items: [
      { label: 'Clientes',    href: '/dashboard/customers',         icon: Users,          allowedRoles: MANAGER_UP },
      { label: 'Cupons',      href: '/dashboard/coupons',           icon: Tag,            minPlan: 'PRO', allowedRoles: MANAGER_UP },
      { label: 'Fidelidade',  href: '/dashboard/loyalty',           icon: Star,           minPlan: 'PRO', allowedRoles: MANAGER_UP },
      { label: 'Avaliações',  href: '/dashboard/reviews',           icon: Star,           allowedRoles: MANAGER_UP },
      { label: 'WhatsApp',    href: '/dashboard/settings/whatsapp', icon: MessageSquare,  minPlan: 'PRO', allowedRoles: MANAGER_UP },
      { label: 'Robô WhatsApp', href: '/dashboard/settings/whatsapp/automacoes', icon: Bot, minPlan: 'PRO', allowedRoles: MANAGER_UP },
      { label: 'WA Chat',     href: '/dashboard/whatsapp-chat',     icon: MessageCircle,  minPlan: 'PRO', allowedRoles: MANAGER_UP },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { label: 'Relatórios',    href: '/dashboard/reports',               icon: BarChart3,  allowedRoles: MANAGER_UP },
      { label: 'Impressoras',   href: '/dashboard/printers',              icon: Printer,    allowedRoles: MANAGER_UP },
      { label: 'Pagamentos',    href: '/dashboard/settings/payments',     icon: QrCode,     allowedRoles: MANAGER_UP },
      { label: 'Integrações',   href: '/dashboard/settings/integrations', icon: Plug,       minPlan: 'PRO', allowedRoles: MANAGER_UP, comingSoon: true },
      { label: 'Permissões',    href: '/dashboard/users',                 icon: ShieldCheck, allowedRoles: ADMIN_ROLES },
      { label: 'Configurações', href: '/dashboard/settings',              icon: Settings,   allowedRoles: ADMIN_ROLES },
    ],
  },
]

// Bottom nav items for mobile (most important 4)
const bottomNavItems = (userRole: string) => {
  if (userRole === 'DELIVERY_PERSON') return [
    { label: 'Entregas', href: '/dashboard/delivery/tracking', icon: Truck },
    { label: 'Pedidos',  href: '/dashboard/orders',          icon: ShoppingBag },
    { label: 'Kanban',   href: '/dashboard/orders/kanban',   icon: ClipboardList },
  ]
  const isOp = ['STAFF', 'ATTENDANT'].includes(userRole)
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
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
      {navSections.map((section) => {
        const visibleItems = section.items.filter(canSee)
        if (visibleItems.length === 0) return null

        return (
          <div key={section.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href))
                const accessible = canAccess(item)
                const Icon = item.icon

                if (item.comingSoon) return (
                  <div key={item.href} title="Em breve — disponível após o lançamento"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-40 cursor-not-allowed select-none">
                    <Icon className="h-4 w-4 flex-shrink-0 text-sidebar-foreground" />
                    <span className="text-sm text-sidebar-foreground">{item.label}</span>
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide bg-white/10 text-sidebar-foreground rounded-full px-2 py-0.5 whitespace-nowrap">
                      Em breve
                    </span>
                  </div>
                )

                if (!accessible) return (
                  <div key={item.href} title={`Disponível no plano ${item.minPlan}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-30 cursor-not-allowed">
                    <Icon className="h-4 w-4 flex-shrink-0 text-sidebar-foreground" />
                    <span className="text-sm text-sidebar-foreground">{item.label}</span>
                  </div>
                )

                return (
                  <Link key={item.href} href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all',
                      isActive
                        ? 'bg-sidebar-active-bg text-sidebar-active-fg font-semibold shadow-sm'
                        : 'text-sidebar-foreground hover:text-white hover:bg-sidebar-hover-bg'
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
            </div>
          </div>
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
      <aside className="hidden md:flex flex-col w-64 border-r border-sidebar-border bg-sidebar shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 h-16 px-4 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-primary">
            <Image src="/logo-icon.png" alt="Meu Cardápio" width={32} height={32} className="object-cover w-full h-full"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement
                el.style.display = 'none'
                el.nextElementSibling?.classList.remove('hidden')
              }} />
            <span className="hidden text-primary-foreground font-bold text-sm">M</span>
          </div>
          <span className="font-semibold text-white">Meu Cardápio</span>
        </div>

        <NavList />

        {/* Role badge */}
        {mode && (
          <div className="px-4 py-3 border-t border-sidebar-border">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/10 text-sidebar-foreground">
              {mode}
            </span>
          </div>
        )}

        {/* Plan */}
        {['TENANT_ADMIN', 'MASTER_ADMIN', 'MANAGER'].includes(userRole) && (
          <div className="px-4 py-3 border-t border-sidebar-border">
            <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full',
              plan === 'PRO' || plan === 'PREMIUM'
                ? 'bg-amber-400/20 text-amber-300'
                : 'bg-white/10 text-sidebar-foreground')}>
              {plan === 'PRO' ? '⚡ Plano Pro' : plan === 'PREMIUM' ? '👑 Premium' : '🆓 Starter'}
            </span>
          </div>
        )}
      </aside>

      {/* ── MOBILE DRAWER OVERLAY ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-primary">
                  <Image src="/logo-icon.png" alt="" width={32} height={32} className="object-cover w-full h-full"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none' }} />
                </div>
                <span className="font-semibold text-white">Meu Cardápio</span>
              </div>
              <button onClick={() => setMobileOpen(false)}
                className="p-2 rounded-xl text-sidebar-foreground hover:text-white hover:bg-sidebar-hover-bg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <NavList />

            {mode && (
              <div className="px-4 py-3 border-t border-sidebar-border">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/10 text-sidebar-foreground">
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
