'use client'
// components/dashboard/pdv-manager.tsx
//
// NOVO: gerenciamento de pontos de venda (Multi-PDV).

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createPdvAction, updatePdvAction, deletePdvAction, setPdvUserAction } from '@/actions/pdv/manage-pdv'
import { Plus, X, Loader2, Store, Trash2, ToggleLeft, ToggleRight, Users, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface PdvItem {
  id: string
  name: string
  type: string
  isActive: boolean
  address: string
  ordersCount: number
  tablesCount: number
  linkedUserIds: string[]
}

interface UserItem {
  id: string
  name: string
  email: string
  role: string
}

const TYPE_LABELS: Record<string, string> = {
  STORE: '🏪 Loja',
  DELIVERY: '🛵 Delivery',
  KIOSK: '🏬 Quiosque',
}

const ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Gerente',
  ATTENDANT: 'Atendente',
  WAITER: 'Garçom',
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {label}
    </button>
  )
}

export function PdvManager({ pdvs: initial, users, hasAccess }: { pdvs: PdvItem[]; users: UserItem[]; hasAccess: boolean }) {
  const [pdvs, setPdvs] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const [createState, createAction] = useFormState(createPdvAction, {})

  if (createState.success && showForm) {
    setShowForm(false)
    toast.success('PDV criado!')
    window.location.reload()
  }

  const handleToggle = (id: string, current: boolean) => {
    start(async () => {
      const fd = new FormData()
      fd.set('pdvId', id)
      fd.set('isActive', String(!current))
      const r = await updatePdvAction(fd)
      if (r.error) { toast.error(r.error); return }
      setPdvs((prev) => prev.map((p) => p.id === id ? { ...p, isActive: !current } : p))
    })
  }

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Excluir o PDV "${name}"?`)) return
    start(async () => {
      const r = await deletePdvAction(id)
      if (r.error) { toast.error(r.error); return }
      setPdvs((prev) => prev.filter((p) => p.id !== id))
      toast.success('PDV excluído')
    })
  }

  const toggleUser = (pdvId: string, userId: string, linked: boolean) => {
    start(async () => {
      const r = await setPdvUserAction(pdvId, userId, !linked)
      if (r.error) { toast.error(r.error); return }
      setPdvs((prev) => prev.map((p) => {
        if (p.id !== pdvId) return p
        const linkedUserIds = linked
          ? p.linkedUserIds.filter((id) => id !== userId)
          : [...p.linkedUserIds, userId]
        return { ...p, linkedUserIds }
      }))
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          disabled={!hasAccess}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="h-4 w-4" /> Novo PDV
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Novo ponto de venda</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
          {createState.error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {createState.error}
            </div>
          )}
          <form action={createAction} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome *</label>
              <input name="name" required placeholder="Ex: Loja Centro, Quiosque Shopping"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Tipo</label>
              <select name="type" defaultValue="STORE"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="STORE">🏪 Loja</option>
                <option value="DELIVERY">🛵 Delivery</option>
                <option value="KIOSK">🏬 Quiosque</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Endereço (opcional)</label>
              <input name="address" placeholder="Rua, número, bairro"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-input rounded-lg hover:bg-muted transition-colors">
                Cancelar
              </button>
              <SubmitBtn label="Criar PDV" />
            </div>
          </form>
        </div>
      )}

      {pdvs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Store className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum ponto de venda criado ainda.</p>
          <p className="text-xs mt-1">Por padrão, todos os pedidos são atribuídos ao PDV principal.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pdvs.map((pdv) => (
            <div key={pdv.id} className={cn('bg-card border border-border rounded-xl transition-all', !pdv.isActive && 'opacity-60')}>
              <div className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-lg">
                  {TYPE_LABELS[pdv.type]?.split(' ')[0] ?? '🏪'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{pdv.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABELS[pdv.type] ?? pdv.type} · {pdv.ordersCount} pedido{pdv.ordersCount !== 1 ? 's' : ''} · {pdv.tablesCount} mesa{pdv.tablesCount !== 1 ? 's' : ''}
                  </p>
                  {pdv.address && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" /> {pdv.address}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => setExpandedId(expandedId === pdv.id ? null : pdv.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors">
                    <Users className="h-3.5 w-3.5" />
                    {pdv.linkedUserIds.length} equipe
                  </button>
                  <button onClick={() => handleToggle(pdv.id, pdv.isActive)} disabled={isPending} title={pdv.isActive ? 'Desativar' : 'Ativar'}>
                    {pdv.isActive
                      ? <ToggleRight className="h-5 w-5 text-emerald-500" />
                      : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => handleDelete(pdv.id, pdv.name)} disabled={isPending}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-40">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Equipe vinculada */}
              {expandedId === pdv.id && (
                <div className="border-t border-border p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Equipe vinculada a este PDV</p>
                  {users.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum atendente/garçom cadastrado ainda.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {users.map((u) => {
                        const linked = pdv.linkedUserIds.includes(u.id)
                        return (
                          <label key={u.id} className="flex items-center gap-2.5 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                            <input
                              type="checkbox"
                              checked={linked}
                              onChange={() => toggleUser(pdv.id, u.id, linked)}
                              disabled={isPending}
                              className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                              <p className="text-xs text-muted-foreground">{ROLE_LABELS[u.role] ?? u.role}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-3">
                    Usuários vinculados verão os pedidos e mesas deste PDV ao acessar o kanban.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
