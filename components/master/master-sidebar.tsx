'use client'

// components/master/master-sidebar.tsx
//
// Extraído de app/(master)/layout.tsx (13/07) — antes era um <aside> fixo
// de largura w-56 sempre visível, sem nenhum tratamento pra mobile (por
// isso cortava a tela em celular). Client component agora porque precisa
// de estado (useState) pra abrir/fechar a gaveta no mobile — mesmo padrão
// já usado em components/dashboard/sidebar.tsx.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, CreditCard, Settings, LogOut, Menu, X, Activity } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/master/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/master/tenants',     icon: Users,           label: 'Estabelecimentos' },
  { href: '/master/billing',     icon: CreditCard,      label: 'Faturamento' },
  { href: '/master/monitoring',  icon: Activity,        label: 'Monitoramento' },
  { href: '/master/settings',    icon: Settings,        label: 'Configurações' },
]

export function MasterSidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { setMobileOpen(false) }, [pathname])

  const NavList = () => (
    <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href as any}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive ? 'bg-gray-800 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-800'
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  const FooterBlock = () => (
    <div className="px-2 py-4 border-t border-gray-700">
      <div className="px-3 py-2 mb-2">
        <p className="text-xs text-gray-400 truncate">{email}</p>
      </div>
      <Link
        href="/api/auth/signout"
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors text-sm w-full"
      >
        <LogOut className="h-4 w-4" />
        Sair
      </Link>
    </div>
  )

  return (
    <>
      {/* ── DESKTOP ── */}
      <aside className="hidden md:flex w-56 bg-gray-900 dark:bg-gray-950 flex-col shrink-0">
        <div className="flex items-center gap-2 px-4 h-16 border-b border-gray-700 shrink-0">
          <div className="w-7 h-7 bg-brand-500 rounded-md flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <span className="text-white font-semibold text-sm">Master Admin</span>
        </div>
        <NavList />
        <FooterBlock />
      </aside>

      {/* ── MOBILE TOP BAR ── */}
      <div className="flex md:hidden items-center justify-between h-14 px-4 bg-gray-900 dark:bg-gray-950 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-500 rounded-md flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <span className="text-white font-semibold text-sm">Master Admin</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* ── MOBILE DRAWER ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-gray-900 dark:bg-gray-950 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-brand-500 rounded-md flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-xs">M</span>
                </div>
                <span className="text-white font-semibold text-sm">Master Admin</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList />
            <FooterBlock />
          </aside>
        </div>
      )}
    </>
  )
}
