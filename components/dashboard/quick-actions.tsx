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
      href: '/dashboard/orders/kanban',
      icon: Plus,
      variant: 'primary',
      onClick: () => router.push('/dashboard/orders/kanban?new=1'),
    },
    {
      label: pendingCount > 0 ? `Ver pedidos (${pendingCount})` : 'Ver pedidos',
      href: '/dashboard/orders/kanban',
      icon: ClipboardList,
      variant: 'default',
      urgent: pendingCount > 0,
    },
    {
      label: 'QR Code das mesas',
      href: '/dashboard/tables',
      icon: QrCode,
      variant: 'default',
    },
    {
      label: 'Relatórios',
      href: '/dashboard/reports',
      icon: BarChart3,
      variant: 'default',
    },
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Link
          key={action.href + action.label}
          href={action.href}
          className={
            action.variant === 'primary'
              ? 'flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors'
              : `flex items-center gap-2 px-4 py-2 bg-card border text-sm font-medium rounded-lg hover:bg-muted transition-colors ${
                  (action as any).urgent
                    ? 'border-orange-300 text-orange-600 dark:border-orange-700 dark:text-orange-400'
                    : 'border-border text-foreground'
                }`
          }
        >
          <action.icon className="h-4 w-4" />
          {action.label}
        </Link>
      ))}
    </div>
  )
}
