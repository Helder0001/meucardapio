// app/(master)/layout.tsx
import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Users, CreditCard, Settings, LogOut } from 'lucide-react'

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (session?.user?.role !== 'MASTER_ADMIN') redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-56 bg-gray-900 dark:bg-gray-950 flex flex-col">
        <div className="flex items-center gap-2 px-4 h-16 border-b border-gray-700">
          <div className="w-7 h-7 bg-brand-500 rounded-md flex items-center justify-center">
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <span className="text-white font-semibold text-sm">Master Admin</span>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-0.5">
          {[
            { href: '/master/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { href: '/master/tenants',   icon: Users,           label: 'Estabelecimentos' },
            { href: '/master/billing',   icon: CreditCard,      label: 'Faturamento' },
            { href: '/master/settings',  icon: Settings,        label: 'Configurações' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href as any}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors text-sm"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-2 py-4 border-t border-gray-700">
          <div className="px-3 py-2 mb-2">
            <p className="text-xs text-gray-400 truncate">{session.user.email}</p>
          </div>
          <Link
            href="/api/auth/signout"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors text-sm w-full"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  )
}