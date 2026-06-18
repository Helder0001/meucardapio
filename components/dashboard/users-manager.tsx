'use client'

// components/dashboard/users-manager.tsx

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createUserAction, deactivateUserAction } from '@/actions/users/manage-users'
import { formatDate, formatRelative } from '@/lib/utils/format'
import { Plus, X, Loader2, UserX, Info } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface UserData {
  id: string
  name: string
  email: string
  role: string
  phone: string | null
  lastLoginAt: Date | null
  createdAt: Date
}

const ROLE_LABELS: Record<string, string> = {
  TENANT_ADMIN:    'Administrador',
  MANAGER:         'Gerente',
  ATTENDANT:       'Atendente',
  WAITER:          'Garçom',
  DELIVERY_PERSON: 'Entregador',
}

const ROLE_DESC: Record<string, string> = {
  MANAGER:         'Acesso completo exceto configurações de conta e usuários',
  ATTENDANT:       'Gerencia pedidos e kanban',
  WAITER:          'Confirmar, cancelar e marcar entregue. Sem relatórios ou configurações',
  DELIVERY_PERSON: 'Visualiza pedidos para entrega',
}

const ROLE_COLORS: Record<string, string> = {
  TENANT_ADMIN:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  MANAGER:         'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  ATTENDANT:       'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  WAITER:          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  DELIVERY_PERSON: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      Criar usuário
    </button>
  )
}

interface UsersManagerProps {
  users: UserData[]
  currentUserId: string
  canAddMore: boolean
  plan: string
}

export function UsersManager({ users: initial, currentUserId, canAddMore, plan }: UsersManagerProps) {
  const [users,     setUsers]     = useState(initial)
  const [showForm,  setShowForm]  = useState(false)
  const [isPending, start]        = useTransition()
  const [formState, formAction]   = useFormState(createUserAction, {})
  const [roleSelected, setRoleSelected] = useState<string>('WAITER')

  if (formState.success && showForm) {
    setShowForm(false)
    toast.success('Usuário criado! Compartilhe a senha com ele para o primeiro acesso.')
    window.location.reload()
  }

  const handleDeactivate = (userId: string, name: string) => {
    if (!confirm(`Desativar o usuário "${name}"? Ele perderá o acesso imediatamente.`)) return
    start(async () => {
      const result = await deactivateUserAction(userId)
      if (result.error) { toast.error(result.error); return }
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      toast.success('Usuário desativado')
    })
  }

  return (
    <div className="space-y-5">
      {/* Aviso de limite */}
      {!canAddMore && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-semibold">Limite de usuários atingido</p>
          <p className="text-xs mt-0.5">
            Faça upgrade do plano para adicionar mais usuários.
            {plan === 'STARTER' && ' O plano Starter suporta apenas 1 usuário.'}
            {plan === 'PRO'     && ' O plano Pro suporta até 5 usuários.'}
          </p>
        </div>
      )}

      {/* Info permissões garçom */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300">
          <p className="font-semibold">Permissões por função</p>
          <ul className="mt-1 text-xs space-y-0.5">
            {Object.entries(ROLE_DESC).map(([role, desc]) => (
              <li key={role}><span className="font-medium">{ROLE_LABELS[role]}:</span> {desc}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs opacity-80">
            Todas as vendas realizadas por garçons ficam registradas nos relatórios com o nome do responsável.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          disabled={!canAddMore}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="h-4 w-4" /> Novo usuário
        </button>
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Criar novo usuário</h3>
            <button onClick={() => setShowForm(false)}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <form action={formAction} className="grid grid-cols-2 gap-4">
            {formState.error && (
              <div className="col-span-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {formState.error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome *</label>
              <input name="name" required placeholder="Nome completo"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email *</label>
              <input name="email" type="email" required placeholder="email@exemplo.com"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Função *</label>
              <select name="role" required value={roleSelected}
                onChange={(e) => setRoleSelected(e.target.value)}
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="MANAGER">Gerente</option>
                <option value="ATTENDANT">Atendente</option>
                <option value="WAITER">Garçom</option>
                <option value="DELIVERY_PERSON">Entregador</option>
              </select>
              {ROLE_DESC[roleSelected] && (
                <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESC[roleSelected]}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Senha inicial *</label>
              <input name="password" type="password" required minLength={8}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-input rounded-lg hover:bg-muted transition-colors">
                Cancelar
              </button>
              <SubmitBtn />
            </div>
          </form>
        </div>
      )}

      {/* Tabela de usuários */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Usuário', 'Função', 'Último acesso', 'Criado em', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-primary">
                        {user.name[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-foreground">{user.name}</p>
                        {user.id === currentUserId && (
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                            você
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    ROLE_COLORS[user.role] ?? 'bg-muted text-muted-foreground'
                  )}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Nunca'}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatDate(user.createdAt)}
                </td>
                <td className="px-4 py-3">
                  {user.id !== currentUserId && (
                    <button
                      onClick={() => handleDeactivate(user.id, user.name)}
                      disabled={isPending}
                      title="Desativar usuário"
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum usuário cadastrado ainda.
          </div>
        )}
      </div>
    </div>
  )
}
