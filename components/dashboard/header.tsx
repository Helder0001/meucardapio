'use client'

// components/dashboard/header.tsx

import { Bell, ChevronDown, LogOut, Settings, User, Receipt, ExternalLink, Sun, Moon, Monitor, PackageX, PackageMinus, ShoppingBag, ChefHat, Bike, CheckCheck } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { formatCurrency, formatOrderNumber } from '@/lib/utils/format'
import { isNotificationRead, markNotificationRead, markAllNotificationsRead, countUnread } from '@/lib/utils/notification-read-state'

interface OrderNotification {
  id: string
  orderId: string
  orderNumber: number
  total: number
  type: string
  createdAt: string
  customerName: string | null
}

interface StockNotification {
  id: string
  productId: string
  productName: string
  updatedAt: string
}

interface LowStockNotification extends StockNotification {
  quantity: number
}

interface SlowOrderNotification {
  id: string
  orderId: string
  orderNumber: number
  minutesAgo: number | null
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
  const [lowStock, setLowStock] = useState<LowStockNotification[]>([])
  const [slowPrep, setSlowPrep] = useState<SlowOrderNotification[]>([])
  const [slowDelivery, setSlowDelivery] = useState<SlowOrderNotification[]>([])
  // Incrementado toda vez que marcamos algo como lido — só pra forçar um
  // re-render (o estado de "lido" em si mora no localStorage, não aqui).
  const [readVersion, setReadVersion] = useState(0)
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
          setLowStock(data.lowStock ?? [])
          setSlowPrep(data.slowPrep ?? [])
          setSlowDelivery(data.slowDelivery ?? [])
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

  const allIds = useMemo(
    () => [...orders, ...outOfStock, ...lowStock, ...slowPrep, ...slowDelivery].map((n) => n.id),
    [orders, outOfStock, lowStock, slowPrep, slowDelivery]
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps -- readVersion só existe pra forçar recálculo
  const unreadCount = useMemo(() => countUnread(allIds), [allIds, readVersion])
  const notificationCount = allIds.length

  const markRead = (id: string) => {
    markNotificationRead(id)
    setReadVersion((v) => v + 1)
  }
  const markAllRead = () => {
    markAllNotificationsRead(allIds)
    setReadVersion((v) => v + 1)
  }

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
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-3.5 w-3.5 bg-primary text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              {/* CORREÇÃO: no mobile, `absolute right-0 w-80` fazia o
                  dropdown vazar pra fora da tela (a largura fixa de 320px
                  não cabe entre o sino e a borda da tela em telas
                  estreitas — ficava cortado à esquerda). Abaixo de sm,
                  vira um painel fixo com margem segura dos dois lados; a
                  partir de sm, volta a ser o dropdown ancorado no sino. */}
              <div
                className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 max-h-[70vh] overflow-y-auto bg-card border border-border rounded-xl z-20 py-2 animate-slide-up"
                style={{ boxShadow: 'var(--shadow-dropdown)' }}
              >
                <div className="px-3 py-2 border-b border-border sticky top-0 bg-card flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Notificações</p>
                  {notificationCount > 0 && unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
                    </button>
                  )}
                </div>
                {notificationCount === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {orders.map((o) => {
                      const read = isNotificationRead(o.id)
                      return (
                        <Link
                          key={o.id}
                          href={`/dashboard/orders/${o.orderId}`}
                          onClick={() => { markRead(o.id); setNotifOpen(false) }}
                          className={cn(
                            'flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                            read ? 'hover:bg-muted' : 'bg-brand-50 dark:bg-brand-950/30 hover:bg-brand-100 dark:hover:bg-brand-950/50'
                          )}
                        >
                          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0', read ? 'bg-muted-foreground/40' : 'bg-primary')}>
                            <ShoppingBag className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className={cn('text-sm truncate', read ? 'text-muted-foreground' : 'font-medium text-foreground')}>
                              Pedido {formatOrderNumber(o.orderNumber)}{o.customerName ? ` — ${o.customerName}` : ''}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatCurrency(o.total)} · aguardando confirmação</p>
                          </div>
                        </Link>
                      )
                    })}
                    {slowPrep.map((o) => {
                      const read = isNotificationRead(o.id)
                      return (
                        <Link
                          key={o.id}
                          href={`/dashboard/orders/${o.orderId}`}
                          onClick={() => { markRead(o.id); setNotifOpen(false) }}
                          className={cn(
                            'flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                            read ? 'hover:bg-muted' : 'bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40'
                          )}
                        >
                          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0', read ? 'bg-muted-foreground/40' : 'bg-amber-500')}>
                            <ChefHat className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className={cn('text-sm truncate', read ? 'text-muted-foreground' : 'font-medium text-foreground')}>
                              Pedido {formatOrderNumber(o.orderNumber)} demorando no preparo
                            </p>
                            <p className="text-xs text-muted-foreground">{o.minutesAgo != null ? `Em preparo há ${o.minutesAgo} min` : 'Em preparo há muito tempo'}</p>
                          </div>
                        </Link>
                      )
                    })}
                    {slowDelivery.map((o) => {
                      const read = isNotificationRead(o.id)
                      return (
                        <Link
                          key={o.id}
                          href={`/dashboard/orders/${o.orderId}`}
                          onClick={() => { markRead(o.id); setNotifOpen(false) }}
                          className={cn(
                            'flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                            read ? 'hover:bg-muted' : 'bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40'
                          )}
                        >
                          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0', read ? 'bg-muted-foreground/40' : 'bg-amber-500')}>
                            <Bike className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className={cn('text-sm truncate', read ? 'text-muted-foreground' : 'font-medium text-foreground')}>
                              Pedido {formatOrderNumber(o.orderNumber)} demorando na entrega
                            </p>
                            <p className="text-xs text-muted-foreground">{o.minutesAgo != null ? `Pronto há ${o.minutesAgo} min` : 'Pronto há muito tempo'}</p>
                          </div>
                        </Link>
                      )
                    })}
                    {lowStock.map((s) => {
                      const read = isNotificationRead(s.id)
                      return (
                        <Link
                          key={s.id}
                          href="/dashboard/stock"
                          onClick={() => { markRead(s.id); setNotifOpen(false) }}
                          className={cn(
                            'flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                            read ? 'hover:bg-muted' : 'bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40'
                          )}
                        >
                          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0', read ? 'bg-muted-foreground/40' : 'bg-amber-500')}>
                            <PackageMinus className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className={cn('text-sm truncate', read ? 'text-muted-foreground' : 'font-medium text-foreground')}>{s.productName}</p>
                            <p className="text-xs text-muted-foreground">Estoque baixo — restam {s.quantity}</p>
                          </div>
                        </Link>
                      )
                    })}
                    {outOfStock.map((s) => {
                      const read = isNotificationRead(s.id)
                      return (
                        <Link
                          key={s.id}
                          href="/dashboard/stock"
                          onClick={() => { markRead(s.id); setNotifOpen(false) }}
                          className={cn(
                            'flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                            read ? 'hover:bg-muted' : 'bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40'
                          )}
                        >
                          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0', read ? 'bg-muted-foreground/40' : 'bg-red-500')}>
                            <PackageX className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className={cn('text-sm truncate', read ? 'text-muted-foreground' : 'font-medium text-foreground')}>{s.productName}</p>
                            <p className="text-xs text-muted-foreground">Estoque esgotado</p>
                          </div>
                        </Link>
                      )
                    })}
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
