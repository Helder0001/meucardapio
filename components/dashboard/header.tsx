'use client'

// components/dashboard/header.tsx

import { Bell, ChevronDown, LogOut, Settings, User, ExternalLink } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
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
  MASTER_ADMIN: 'Master Admin',
  TENANT_ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  ATTENDANT: 'Atendente',
  WAITER: 'Garçom',
  DELIVERY_PERSON: 'Entregador',
}

export function Header({ user }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  // Buscar pedidos pendentes para notificação
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
    const interval = setInterval(fetchPending, 30000) // atualiza a cada 30s
    return () => clearInterval(interval)
  }, [])

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 flex-shrink-0">
      <div />

      {/* Direita: ações */}
      <div className="flex items-center gap-3">
        {/* Ver cardápio público */}
        {user.tenantSlug && (
          <Link
            href={`/menu/${user.tenantSlug}`}
            target="_blank"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">Ver cardápio</span>
          </Link>
        )}

        {/* Notificações */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setMenuOpen(false) }}
            className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            <Bell className="h-5 w-5" />
            {pendingCount > 0 && (
              <span className="absolute top-1 right-1 h-4 w-4 bg-destructive text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-72 bg-card border border-border rounded-lg shadow-lg z-20 py-2">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">Notificações</p>
                </div>
                {pendingCount > 0 ? (
                  <div className="px-3 py-3">
                    <Link
                      href="/dashboard/orders/kanban"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center gap-3 p-2 bg-orange-50 dark:bg-orange-950/20 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-950/30 transition-colors"
                    >
                      <span className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {pendingCount}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">Pedidos aguardando</p>
                        <p className="text-xs text-muted-foreground">{pendingCount} pedido{pendingCount !== 1 ? 's' : ''} pendente{pendingCount !== 1 ? 's' : ''}</p>
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

        {/* Menu do usuário */}
        <div className="relative">
          <button
            onClick={() => { setMenuOpen(!menuOpen); setNotifOpen(false) }}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">
                {user.name?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-foreground leading-tight">
                {user.name ?? 'Usuário'}
              </p>
              <p className="text-xs text-muted-foreground leading-tight">
                {roleLabels[user.role] ?? user.role}
              </p>
            </div>
            <ChevronDown className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              menuOpen && 'rotate-180'
            )} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-lg shadow-lg z-20 py-1 animate-slide-up">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>

                <Link
                  href="/dashboard/settings/profile"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Meu perfil
                </Link>

                <Link
                  href="/dashboard/settings"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Configurações
                </Link>

                <div className="border-t border-border mt-1 pt-1">
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 w-full transition-colors"
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
