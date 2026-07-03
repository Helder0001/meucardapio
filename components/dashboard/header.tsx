'use client'

// components/dashboard/header.tsx

import { Bell, ChevronDown, LogOut, Settings, User, ExternalLink, Sun, Moon, Monitor } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'

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
  const [pendingCount, setPendingCount] = useState(0)
  const [mounted, setMounted]     = useState(false)

  const { theme, setTheme, resolvedTheme } = useTheme()

  // Evitar hydration mismatch — não renderizar ícone de tema no SSR
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await fetch('/api/orders/kanban')
        if (res.ok) {
          const data = await res.json()
          const pending = (data.PENDING?.length ?? 0) + (data.CONFIRMED?.length ?? 0)
          setPendingCount(pending)
        }
      } catch {}
    }
    fetchPending()
    const interval = setInterval(fetchPending, 30000)
    return () => clearInterval(interval)
  }, [])

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
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center overflow-hidden flex-shrink-0">
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
            {pendingCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-3.5 w-3.5 bg-primary text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div
                className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl z-20 py-2 animate-slide-up"
                style={{ boxShadow: 'var(--shadow-dropdown)' }}
              >
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">Notificações</p>
                </div>
                {pendingCount > 0 ? (
                  <div className="p-2">
                    <Link
                      href="/dashboard/orders/kanban"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center gap-3 p-2.5 bg-brand-50 dark:bg-brand-950/30 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors"
                    >
                      <span className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {pendingCount}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">Pedidos aguardando</p>
                        <p className="text-xs text-muted-foreground">
                          {pendingCount} pedido{pendingCount !== 1 ? 's' : ''} pendente{pendingCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </Link>
                  </div>
                ) : (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
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
