'use client'

// components/dashboard/sidebar.tsx

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Users, Table2,
  Truck, BarChart3, Settings, Tag, Star, MessageSquare, MessageCircle, Printer,
  QrCode, ShieldCheck, X, Menu,
  Bell, ClipboardList, Boxes, Plug, Bot, Wallet,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useDashboardDict, useDashboardLocale } from '@/lib/i18n/dashboard-context'
import { DASHBOARD_LOCALES } from '@/lib/i18n/dashboard'
import { setDashboardLocaleAction } from '@/actions/i18n/set-locale'
import { LanguageSwitcher } from '@/components/shared/language-switcher'

interface NavItem {
  id: keyof ReturnType<typeof useDashboardDict>['nav']
  href: string
  icon: React.ElementType
  badge?: number
  minPlan?: 'PRO' | 'PREMIUM'
  allowedRoles?: string[]
  comingSoon?: boolean
}

interface NavSection {
  sectionId: keyof ReturnType<typeof useDashboardDict>['nav']
  items: NavItem[]
}

const ADMIN_ROLES  = ['TENANT_ADMIN']
const MANAGER_UP   = ['TENANT_ADMIN', 'MANAGER']
const ORDERS_ROLES = ['TENANT_ADMIN', 'MANAGER', 'ATTENDANT', 'STAFF', 'DELIVERY_PERSON']

// Antes uma lista única de 22 itens sem hierarquia — agrupado por área
// de uso pra ficar mais fácil de escanear visualmente.
//
// CORREÇÃO (i18n): os itens agora guardam um `id` (chave do dicionário em
// lib/i18n/dashboard.ts) em vez do texto fixo em português — o label é
// resolvido em tempo de render via `t.nav[item.id]`, então trocar o idioma
// no seletor (independente do storefront/landing) atualiza a sidebar
// inteira sem duplicar essa lista por idioma.
const navSections: NavSection[] = [
  {
    sectionId: 'sectionOperacao',
    items: [
      { id: 'dashboard', href: '/dashboard',               icon: LayoutDashboard, allowedRoles: MANAGER_UP },
      { id: 'pedidos',   href: '/dashboard/orders',        icon: ShoppingBag,     allowedRoles: ORDERS_ROLES },
      { id: 'kanban',    href: '/dashboard/orders/kanban', icon: ClipboardList,   allowedRoles: ORDERS_ROLES },
      { id: 'minhasEntregas', href: '/dashboard/delivery/tracking', icon: Truck, allowedRoles: ['DELIVERY_PERSON', ...MANAGER_UP] },
      { id: 'mesas',     href: '/dashboard/tables',        icon: Table2,          allowedRoles: MANAGER_UP },
      { id: 'delivery',  href: '/dashboard/delivery',      icon: Truck,           minPlan: 'PRO', allowedRoles: MANAGER_UP },
    ],
  },
  {
    sectionId: 'sectionCardapio',
    items: [
      { id: 'produtos',    href: '/dashboard/menu/products',   icon: UtensilsCrossed, allowedRoles: MANAGER_UP },
      { id: 'categorias',  href: '/dashboard/menu/categories', icon: UtensilsCrossed, allowedRoles: MANAGER_UP },
      { id: 'adicionais',  href: '/dashboard/menu/addons',     icon: UtensilsCrossed, allowedRoles: MANAGER_UP },
      { id: 'estoque',     href: '/dashboard/stock',           icon: Boxes,           allowedRoles: MANAGER_UP },
    ],
  },
  {
    sectionId: 'sectionClientes',
    items: [
      { id: 'clientes',    href: '/dashboard/customers',         icon: Users,          allowedRoles: MANAGER_UP },
      { id: 'cupons',      href: '/dashboard/coupons',           icon: Tag,            minPlan: 'PRO', allowedRoles: MANAGER_UP },
      { id: 'fidelidade',  href: '/dashboard/loyalty',           icon: Star,           minPlan: 'PRO', allowedRoles: MANAGER_UP },
      { id: 'avaliacoes',  href: '/dashboard/reviews',           icon: Star,           allowedRoles: MANAGER_UP },
      { id: 'whatsapp',    href: '/dashboard/settings/whatsapp', icon: MessageSquare,  minPlan: 'PRO', allowedRoles: MANAGER_UP },
      { id: 'roboWhatsapp', href: '/dashboard/settings/whatsapp/automacoes', icon: Bot, minPlan: 'PRO', allowedRoles: MANAGER_UP },
      { id: 'waChat',     href: '/dashboard/whatsapp-chat',     icon: MessageCircle,  minPlan: 'PRO', allowedRoles: MANAGER_UP },
    ],
  },
  {
    sectionId: 'sectionConfiguracoes',
    items: [
      { id: 'financeiro',    href: '/dashboard/financeiro',            icon: Wallet,     minPlan: 'PRO', allowedRoles: ADMIN_ROLES },
      { id: 'relatorios',    href: '/dashboard/reports',               icon: BarChart3,  allowedRoles: MANAGER_UP },
      { id: 'impressoras',   href: '/dashboard/printers',              icon: Printer,    allowedRoles: MANAGER_UP },
      { id: 'pagamentos',    href: '/dashboard/settings/payments',     icon: QrCode,     allowedRoles: MANAGER_UP },
      { id: 'integracoes',   href: '/dashboard/settings/integrations', icon: Plug,       minPlan: 'PRO', allowedRoles: MANAGER_UP, comingSoon: true },
      { id: 'permissoes',    href: '/dashboard/users',                 icon: ShieldCheck, allowedRoles: ADMIN_ROLES },
      { id: 'configuracoes', href: '/dashboard/settings',              icon: Settings,   allowedRoles: ADMIN_ROLES },
    ],
  },
]

// Bottom nav items for mobile (most important 4)
const bottomNavItems = (userRole: string): { id: NavItem['id']; href: string; icon: React.ElementType }[] => {
  if (userRole === 'DELIVERY_PERSON') return [
    { id: 'entregas', href: '/dashboard/delivery/tracking', icon: Truck },
    { id: 'pedidos',  href: '/dashboard/orders',          icon: ShoppingBag },
    { id: 'kanban',   href: '/dashboard/orders/kanban',   icon: ClipboardList },
  ]
  const isOp = ['STAFF', 'ATTENDANT'].includes(userRole)
  if (isOp) return [
    { id: 'pedidos',  href: '/dashboard/orders',          icon: ShoppingBag },
    { id: 'kanban',   href: '/dashboard/orders/kanban',   icon: ClipboardList },
  ]
  return [
    { id: 'inicio',   href: '/dashboard',                 icon: LayoutDashboard },
    { id: 'pedidos',  href: '/dashboard/orders',          icon: ShoppingBag },
    { id: 'kanban',   href: '/dashboard/orders/kanban',   icon: ClipboardList },
    { id: 'relatorios', href: '/dashboard/reports',       icon: BarChart3 },
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
  const t = useDashboardDict()
  const locale = useDashboardLocale()

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
          <div key={section.sectionId}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {t.nav[section.sectionId]}
            </p>
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href))
                const accessible = canAccess(item)
                const Icon = item.icon
                const label = t.nav[item.id]

                if (item.comingSoon) return (
                  <div key={item.href} title={`${t.nav.emBreve} — disponível após o lançamento`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-40 cursor-not-allowed select-none">
                    <Icon className="h-4 w-4 flex-shrink-0 text-sidebar-foreground" />
                    <span className="text-sm text-sidebar-foreground">{label}</span>
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide bg-white/10 text-sidebar-foreground rounded-full px-2 py-0.5 whitespace-nowrap">
                      {t.nav.emBreve}
                    </span>
                  </div>
                )

                if (!accessible) return (
                  <div key={item.href} title={`${t.nav.disponivelNoPlano} ${item.minPlan}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-30 cursor-not-allowed">
                    <Icon className="h-4 w-4 flex-shrink-0 text-sidebar-foreground" />
                    <span className="text-sm text-sidebar-foreground">{label}</span>
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
                    <span>{label}</span>
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
    MANAGER: t.modes.manager, ATTENDANT: t.modes.attendant,
    STAFF: t.modes.staff, DELIVERY_PERSON: t.modes.deliveryPerson,
  }
  const mode = modeLabel[userRole]

  const bottomItems = bottomNavItems(userRole)

  return (
    <>
      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex flex-col w-64 border-r border-sidebar-border bg-sidebar shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 h-16 px-4 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
            <Image src="/logo-icon.png" alt="Meu Cardápio" width={32} height={32} className="object-cover w-full h-full"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement
                el.style.display = 'none'
                el.nextElementSibling?.classList.remove('hidden')
              }} />
            <span className="hidden text-primary-foreground font-bold text-sm">M</span>
          </div>
          <span className="font-semibold text-white flex-1">Meu Cardápio</span>
          <LanguageSwitcher
            locales={DASHBOARD_LOCALES}
            currentLocale={locale}
            onChange={setDashboardLocaleAction}
            label={t.languageSwitcher.label}
            variant="dark"
          />
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
              {plan === 'PRO' ? t.plan.pro : plan === 'PREMIUM' ? t.plan.premium : t.plan.starter}
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
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <Image src="/logo-icon.png" alt="" width={32} height={32} className="object-cover w-full h-full"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none' }} />
                </div>
                <span className="font-semibold text-white">Meu Cardápio</span>
              </div>
              <div className="flex items-center gap-1">
                <LanguageSwitcher
                  locales={DASHBOARD_LOCALES}
                  currentLocale={locale}
                  onChange={setDashboardLocaleAction}
                  label={t.languageSwitcher.label}
                  variant="dark"
                />
                <button onClick={() => setMobileOpen(false)}
                  className="p-2 rounded-xl text-sidebar-foreground hover:text-white hover:bg-sidebar-hover-bg">
                  <X className="h-5 w-5" />
                </button>
              </div>
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
            <span className="text-[10px] font-medium">{t.nav.menuMobile}</span>
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
                <span className="text-[10px] font-medium">{t.nav[item.id]}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
