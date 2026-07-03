'use client'
// components/dashboard/quick-actions.tsx

import Link from 'next/link'
import { Plus, QrCode, ClipboardList, BarChart3 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface QuickActionsProps {
  tenantId: string
  pendingCount: number
}

export function QuickActions({ tenantId, pendingCount }: QuickActionsProps) {
  const router = useRouter()

  const actions = [
    {
      label: 'Novo pedido',
      href: '/dashboard/orders/kanban?new=1',
      icon: Plus,
      primary: true,
      urgent: false,
    },
    {
      label: pendingCount > 0 ? `Pedidos pendentes (${pendingCount})` : 'Kanban',
      href: '/dashboard/orders/kanban',
      icon: ClipboardList,
      primary: false,
      urgent: pendingCount > 0,
    },
    {
      label: 'QR das mesas',
      href: '/dashboard/tables',
      icon: QrCode,
      primary: false,
      urgent: false,
    },
    {
      label: 'Relatórios',
      href: '/dashboard/reports',
      icon: BarChart3,
      primary: false,
      urgent: false,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
      {actions.map((action) => {
        const baseClass = 'flex items-center justify-center gap-2 px-4 py-3 md:py-2.5 text-sm font-medium rounded-xl transition-all duration-150'

        let cls = baseClass
        if (action.primary) {
          cls += ' bg-primary text-white shadow-sm hover:bg-primary/90 hover:shadow-md'
        } else if (action.urgent) {
          cls += ' bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100'
        } else {
          cls += ' bg-card border border-border text-foreground hover:bg-muted hover:border-muted-foreground/20'
        }

        return (
          <Link key={action.href + action.label} href={action.href} className={cls}>
            <action.icon className="h-4 w-4 flex-shrink-0" />
            {action.label}
            {action.urgent && (
              <span className="ml-1 w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            )}
          </Link>
        )
      })}
    </div>
  )
}
