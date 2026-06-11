'use client'
// components/dashboard/addons-manager.tsx

import { useState, useTransition } from 'react'
import {
  createAddonGroupAction, updateAddonGroupAction, deleteAddonGroupAction,
  createAddonAction, updateAddonAction, deleteAddonAction,
} from '@/actions/addons/manage-addons'
import { formatCurrency } from '@/lib/utils/format'
import { Plus, Edit2, Trash2, X, Loader2, ChevronDown, ChevronUp, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AddonItem {
  id: string; name: string; price: number; isActive: boolean; sortOrder: number
}
interface AddonGroup {
  id: string; name: string; minSelect: number; maxSelect: number
  isRequired: boolean; _count: { products: number }
  addons: AddonItem[]
}

export function AddonsManager({ groups: initial }: { groups: AddonGroup[] }) {
  const [groups,    setGroups]    = useState(initial)
  const [showForm,  setShowForm]  = useState(false)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [isPending, start]        = useTransition()
  // estado para edição inline
  const [editGroup, setEditGroup] = useState<string | null>(null)
  const [addingTo,  setAddingTo]  = useState<string | null>(null)
  const [editAddon, setEditAddon] = useState<string | null>(null)

  // ── Grupo: criar ────────────────────────────────────────
  const handleCreateGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const r = await createAddonGroupAction(fd)
      if (r.error) { toast.error(r.error); return }
      toast.success('Grupo criado!')
      setShowForm(false)
      window.location.reload()
    })
  }

  // ── Grupo: editar ────────────────────────────────────────
  const handleUpdateGroup = async (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('groupId', id)
    start(async () => {
      const r = await updateAddonGroupAction(fd)
      if (r.error) { toast.error(r.error); return }
      toast.success('Grupo atualizado!')
      setEditGroup(null)
      window.location.reload()
    })
  }

  // ── Grupo: excluir ───────────────────────────────────────
  const handleDeleteGroup = (id: string, name: string, productCount: number) => {
    if (productCount > 0) {
      toast.error(`Este grupo está vinculado a ${productCount} produto(s). Desvincule antes de excluir.`)
      return
    }
    if (!confirm(`Excluir o grupo "${name}" e todos os seus itens?`)) return
    start(async () => {
      const r = await deleteAddonGroupAction(id)
      if (r.error) { toast.error(r.error); return }
      setGroups((p) => p.filter((g) => g.id !== id))
      toast.success('Grupo excluído')
    })
  }

  // ── Addon: criar ─────────────────────────────────────────
  const handleCreateAddon = async (e: React.FormEvent<HTMLFormElement>, groupId: string) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('groupId', groupId)
    start(async () => {
      const r = await createAddonAction(fd)
      if (r.error) { toast.error(r.error); return }
      toast.success('Item adicionado!')
      setAddingTo(null)
      window.location.reload()
    })
  }

  // ── Addon: toggle ativo ──────────────────────────────────
  const handleToggleAddon = (addonId: string, groupId: string, current: boolean) => {
    start(async () => {
      const r = await updateAddonAction(addonId, { isActive: !current })
      if (r.error) { toast.error(r.error); return }
      setGroups((prev) => prev.map((g) =>
        g.id !== groupId ? g : {
          ...g,
          addons: g.addons.map((a) => a.id === addonId ? { ...a, isActive: !current } : a),
        }
      ))
    })
  }

  // ── Addon: excluir ───────────────────────────────────────
  const handleDeleteAddon = (addonId: string, groupId: string, name: string) => {
    if (!confirm(`Excluir o item "${name}"?`)) return
    start(async () => {
      const r = await deleteAddonAction(addonId)
      if (r.error) { toast.error(r.error); return }
      setGroups((prev) => prev.map((g) =>
        g.id !== groupId ? g : { ...g, addons: g.addons.filter((a) => a.id !== addonId) }
      ))
      toast.success('Item excluído')
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Novo grupo
        </button>
      </div>

      {/* Formulário de criação de grupo */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Novo grupo de adicionais</h3>
            <button onClick={() => setShowForm(false)}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <form onSubmit={handleCreateGroup} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Nome do grupo *
              </label>
              <input name="name" required placeholder="Ex: Ponto da carne, Adicionais, Molhos"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Mínimo de seleções
              </label>
              <input name="minSelect" type="number" min="0" defaultValue="0"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <p className="text-xs text-muted-foreground mt-1">0 = opcional</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Máximo de seleções
              </label>
              <input name="maxSelect" type="number" min="1" defaultValue="1"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <p className="text-xs text-muted-foreground mt-1">1 = apenas 1 opção (rádio)</p>
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="isRequired"
                  className="w-4 h-4 rounded border-input text-primary focus:ring-ring" />
                <span className="text-sm text-foreground">Seleção obrigatória</span>
              </label>
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-input rounded-lg hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Criar grupo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de grupos */}
      {groups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">➕</div>
          <p className="text-sm">Nenhum grupo de adicionais criado</p>
          <p className="text-xs mt-1 text-muted-foreground">
            Crie grupos como "Ponto da carne" ou "Molhos" e vincule aos produtos
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.id} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Header do grupo */}
            {editGroup === group.id ? (
              <div className="p-4 border-b border-border">
                <form onSubmit={(e) => handleUpdateGroup(e, group.id)} className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <input name="name" defaultValue={group.name} required
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Mín.</label>
                    <input name="minSelect" type="number" min="0" defaultValue={group.minSelect}
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Máx.</label>
                    <input name="maxSelect" type="number" min="1" defaultValue={group.maxSelect}
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div className="col-span-2 flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" name="isRequired" defaultChecked={group.isRequired}
                        className="w-4 h-4 rounded border-input text-primary focus:ring-ring" />
                      <span className="text-sm">Obrigatório</span>
                    </label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditGroup(null)}
                        className="px-3 py-1.5 text-xs border border-input rounded-lg hover:bg-muted">
                        Cancelar
                      </button>
                      <button type="submit" disabled={isPending}
                        className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60">
                        Salvar
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            ) : (
              <div className="p-4 flex items-center gap-3">
                <button
                  onClick={() => setExpanded((p) => p === group.id ? null : group.id)}
                  className="flex-1 flex items-center gap-3 text-left"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.isRequired ? 'Obrigatório' : 'Opcional'} •{' '}
                      {group.maxSelect === 1 ? 'Escolha 1' : `Até ${group.maxSelect}`} •{' '}
                      {group.addons.length} item(ns) •{' '}
                      {group._count.products} produto(s)
                    </p>
                  </div>
                  {expanded === group.id
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setEditGroup(group.id)}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(group.id, group.name, group._count.products)}
                    disabled={isPending}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-40">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Lista de itens (expandida) */}
            {expanded === group.id && (
              <div className="border-t border-border">
                {group.addons.map((addon) => (
                  <div key={addon.id}
                    className={cn('flex items-center gap-3 px-4 py-3 border-b border-border last:border-0', !addon.isActive && 'opacity-50')}>
                    {editAddon === addon.id ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault()
                          const fd = new FormData(e.currentTarget)
                          start(async () => {
                            const r = await updateAddonAction(addon.id, {
                              name:  fd.get('name') as string,
                              price: Number(fd.get('price')),
                            })
                            if (r.error) { toast.error(r.error); return }
                            setEditAddon(null)
                            window.location.reload()
                          })
                        }}
                        className="flex-1 flex items-center gap-2"
                      >
                        <input name="name" defaultValue={addon.name} required
                          className="flex-1 px-2 py-1.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                        <input name="price" type="number" step="0.01" min="0" defaultValue={addon.price}
                          className="w-24 px-2 py-1.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                        <button type="submit" disabled={isPending}
                          className="px-2 py-1.5 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 disabled:opacity-60">
                          ✓
                        </button>
                        <button type="button" onClick={() => setEditAddon(null)}
                          className="px-2 py-1.5 border border-input text-xs rounded-lg hover:bg-muted">
                          ✕
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="flex-1">
                          <span className="text-sm text-foreground">{addon.name}</span>
                          {addon.price > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">+{formatCurrency(addon.price)}</span>
                          )}
                        </div>
                        <button onClick={() => handleToggleAddon(addon.id, group.id, addon.isActive)} disabled={isPending}>
                          {addon.isActive
                            ? <ToggleRight className="h-4 w-4 text-emerald-500" />
                            : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                        </button>
                        <button onClick={() => setEditAddon(addon.id)}
                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteAddon(addon.id, group.id, addon.name)} disabled={isPending}
                          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-40">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))}

                {/* Formulário de novo item */}
                {addingTo === group.id ? (
                  <form onSubmit={(e) => handleCreateAddon(e, group.id)}
                    className="flex items-center gap-2 px-4 py-3 bg-muted/30">
                    <input name="name" required autoFocus placeholder="Nome do item"
                      className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                    <input name="price" type="number" step="0.01" min="0" defaultValue="0"
                      placeholder="Preço (0 = grátis)"
                      className="w-32 px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button type="submit" disabled={isPending}
                      className="px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 flex items-center gap-1.5">
                      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Adicionar
                    </button>
                    <button type="button" onClick={() => setAddingTo(null)}
                      className="px-3 py-2 border border-input text-sm rounded-lg hover:bg-muted">
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setAddingTo(group.id)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-primary hover:bg-muted/30 transition-colors">
                    <Plus className="h-4 w-4" /> Adicionar item
                  </button>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
