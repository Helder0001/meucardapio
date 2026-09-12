'use client'

// components/dashboard/header.tsx

import { Bell, ChevronDown, LogOut, Settings, User, Receipt, ExternalLink, Sun, Moon, Monitor, PackageX, ShoppingBag } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { formatCurrency, formatOrderNumber } from '@/lib/utils/format'

interface OrderNotification {
  id: string
  orderNumber: number
  total: number
  type: string
  createdAt: string
  customerName: string | null
}

interface StockNotification {
  productId: string
  productName: string
  updatedAt: string
}

interface HeaderProps {
  user: {
    name?: string | null
    email?: string | null
    role: string
    tenantSlug: string | null
  }
}

const roleLabels: Record<string, string> = {
  MASTER_ADMIN:    'Master Admin',
  TENANT_ADMIN:    'Administrador',
  MANAGER:         'Gerente',
  ATTENDANT:       'Atendente',
  STAFF:          'Operador',
  DELIVERY_PERSON: 'Entregador',
}

// Ciclo de temas: system → light → dark → system
const THEME_CYCLE = ['system', 'light', 'dark'] as const
type ThemeValue = typeof THEME_CYCLE[number]

const THEME_CONFIG: Record<ThemeValue, { icon: React.ElementType; label: string; next: ThemeValue }> = {
  system: { icon: Monitor, label: 'Sistema',   next: 'light' },
  light:  { icon: Sun,     label: 'Claro',     next: 'dark'  },
  dark:   { icon: Moon,    label: 'Escuro',    next: 'system' },
}

export function Header({ user }: HeaderProps) {
  const [menuOpen, setMenuOpen]   = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  // CORREÇÃO (#3): antes só existia uma contagem (`pendingCount`) usada
  // pra montar um único item agregado no dropdown ("Pedidos aguardando —
  // N pendentes"). Agora guardamos as listas de verdade — cada pedido
  // pendente e cada produto esgotado aparece como seu próprio item.
  const [orders, setOrders] = useState<OrderNotification[]>([])
  const [outOfStock, setOutOfStock] = useState<StockNotification[]>([])
  const [mounted, setMounted]     = useState(false)

  const { theme, setTheme, resolvedTheme } = useTheme()

  // Evitar hydration mismatch — não renderizar ícone de tema no SSR
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications/list')
        if (res.ok) {
          const data = await res.json()
          setOrders(data.orders ?? [])
          setOutOfStock(data.outOfStock ?? [])
        }
      } catch {}
    }
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    window.addEventListener('meucardapio:new-order', fetchNotifications)
    return () => {
      clearInterval(interval)
      window.removeEventListener('meucardapio:new-order', fetchNotifications)
    }
  }, [])

  const notificationCount = orders.length + outOfStock.length

  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  const currentTheme = (theme as ThemeValue) ?? 'system'
  const themeConfig  = THEME_CONFIG[currentTheme] ?? THEME_CONFIG.system
  const ThemeIcon    = themeConfig.icon

  const cycleTheme = () => setTheme(themeConfig.next)

  return (
    <header
      className="h-14 md:h-16 bg-card border-b border-border flex items-center justify-between px-3 md:px-6 flex-shrink-0 gap-2"
      style={{ boxShadow: '0 1px 0 hsl(var(--border))' }}
    >
      {/* Mobile: show app name; Desktop: empty left side */}
      <div className="flex items-center gap-2 md:hidden">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
          <Image src="/logo-icon.png" alt="" width={28} height={28} className="object-cover w-full h-full"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none' }} />
        </div>
        <span className="font-semibold text-sm text-foreground">Meu Cardápio</span>
      </div>
      <div className="hidden md:block" />

      {/* Direita */}
      <div className="flex items-center gap-1 md:gap-2">
        {/* Ver cardápio */}
        {user.tenantSlug && (
          <Link
            href={`/menu/${user.tenantSlug}`}
            target="_blank"
            className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Ver cardápio</span>
          </Link>
        )}

        {/* Toggle tema */}
        {mounted && (
          <button
            onClick={cycleTheme}
            title={`Tema atual: ${themeConfig.label}. Clique para alternar.`}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <ThemeIcon className="h-5 w-5" />
          </button>
        )}

        {/* Notificações */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setMenuOpen(false) }}
            className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-3.5 w-3.5 bg-primary text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div
                className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto bg-card border border-border rounded-xl z-20 py-2 animate-slide-up"
                style={{ boxShadow: 'var(--shadow-dropdown)' }}
              >
                <div className="px-3 py-2 border-b border-border sticky top-0 bg-card">
                  <p className="text-sm font-semibold text-foreground">Notificações</p>
                </div>
                {notificationCount === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {/* CORREÇÃO (#3): cada pedido pendente vira seu próprio
                        item, linkando direto pro pedido — antes era um
                        único card agregado que só linkava pro Kanban. */}
                    {orders.map((o) => (
                      <Link
                        key={o.id}
                        href={`/dashboard/orders/${o.id}`}
                        onClick={() => setNotifOpen(false)}
                        className="flex items-center gap-3 p-2.5 bg-brand-50 dark:bg-brand-950/30 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors"
                      >
                        <span className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white flex-shrink-0">
                          <ShoppingBag className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            Pedido {formatOrderNumber(o.orderNumber)}{o.customerName ? ` — ${o.customerName}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(o.total)} · aguardando confirmação</p>
                        </div>
                      </Link>
                    ))}
                    {/* CORREÇÃO (#3): novo tipo de notificação — produto
                        com estoque zerado. Linka pra tela de Estoque. */}
                    {outOfStock.map((s) => (
                      <Link
                        key={s.productId}
                        href="/dashboard/stock"
                        onClick={() => setNotifOpen(false)}
                        className="flex items-center gap-3 p-2.5 bg-red-50 dark:bg-red-950/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
                      >
                        <span className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                          <PackageX className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{s.productName}</p>
                          <p className="text-xs text-muted-foreground">Estoque esgotado</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Separador */}
        <div className="h-6 w-px bg-border mx-1" />

        {/* Menu usuário */}
        <div className="relative">
          <button
            onClick={() => { setMenuOpen(!menuOpen); setNotifOpen(false) }}
            className="flex items-center gap-2.5 pl-1 pr-2 py-1.5 rounded-xl hover:bg-muted transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-sm">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-foreground leading-tight">{user.name ?? 'Usuário'}</p>
              <p className="text-xs text-muted-foreground leading-tight">{roleLabels[user.role] ?? user.role}</p>
            </div>
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', menuOpen && 'rotate-180')} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div
                className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-xl z-20 py-1.5 animate-slide-up"
                style={{ boxShadow: 'var(--shadow-dropdown)' }}
              >
                <div className="px-3 py-2 border-b border-border mb-1">
                  <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>

                <Link
                  href="/dashboard/settings/profile"
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Meu perfil
                </Link>

                {['TENANT_ADMIN', 'MASTER_ADMIN'].includes(user.role) && (
                  <Link
                    href="/dashboard/settings"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    Configurações
                  </Link>
                )}

                {/* Assinatura fica fora do "Meu perfil" — é assunto de
                    billing do estabelecimento, não do usuário logado, e
                    quem administra manager/staff também não deve ver isso
                    (só TENANT_ADMIN, o dono do estabelecimento). */}
                {user.role === 'TENANT_ADMIN' && (
                  <Link
                    href="/dashboard/settings/subscription"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    Assinatura
                  </Link>
                )}

                {/* Tema no menu do usuário (alternativa para mobile) */}
                <button
                  onClick={() => { cycleTheme(); setMenuOpen(false) }}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted w-full transition-colors"
                >
                  {mounted
                    ? <ThemeIcon className="h-4 w-4 text-muted-foreground" />
                    : <Monitor className="h-4 w-4 text-muted-foreground" />
                  }
                  Tema: {mounted ? themeConfig.label : 'Sistema'}
                </button>

                <div className="border-t border-border mt-1 pt-1">
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 w-full transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
