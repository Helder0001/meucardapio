// components/master/tenants-table.tsx

import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

interface Tenant {
  id: string
  name: string
  slug: string
  plan: string
  subscriptionStatus: string
  createdAt: Date
  ordersCount: number
  usersCount: number
  monthlyRevenue: number
}

const PLAN_STYLE: Record<string, string> = {
  STARTER: 'bg-muted text-muted-foreground',
  PRO:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PREMIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  TRIAL:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  PAST_DUE:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  CANCELLED: 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400',
  SUSPENDED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-500',
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo', TRIAL: 'Trial', PAST_DUE: 'Atrasado',
  CANCELLED: 'Cancelado', SUSPENDED: 'Suspenso',
}

export function TenantsTable({ tenants }: { tenants: Tenant[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {['Estabelecimento','Plano','Status','Pedidos','MRR','Cadastro'].map((h) => (
              <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.id} className="border-b border-border hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">{tenant.name}</p>
                <p className="text-xs text-muted-foreground">{tenant.slug}</p>
              </td>
              <td className="px-4 py-3">
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', PLAN_STYLE[tenant.plan])}>
                  {tenant.plan}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_STYLE[tenant.subscriptionStatus])}>
                  {STATUS_LABELS[tenant.subscriptionStatus] ?? tenant.subscriptionStatus}
                </span>
              </td>
              <td className="px-4 py-3 text-foreground">{tenant.ordersCount.toLocaleString('pt-BR')}</td>
              <td className="px-4 py-3 font-medium text-foreground">
                {tenant.monthlyRevenue > 0 ? formatCurrency(tenant.monthlyRevenue) : '—'}
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs">
                {formatDate(tenant.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
