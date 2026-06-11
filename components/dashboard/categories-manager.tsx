'use client'
// components/dashboard/categories-manager.tsx

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from '@/actions/categories/manage-categories'
import { ImageUpload } from '@/components/shared/image-upload'
import { Plus, Edit2, Trash2, X, Loader2, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Category {
  id: string; name: string; description: string | null
  image: string | null; sortOrder: number; isActive: boolean
  _count: { products: number }
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

export function CategoriesManager({ categories: initial }: { categories: Category[] }) {
  const [categories,  setCategories]  = useState(initial)
  const [showForm,    setShowForm]    = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editImage,   setEditImage]   = useState('')
  const [newImage,    setNewImage]    = useState('')
  const [isPending,   start]          = useTransition()
  const [createState, createAction]   = useFormState(createCategoryAction, {})

  if (createState.success && showForm) {
    setShowForm(false); setNewImage('')
    toast.success('Categoria criada!')
    window.location.reload()
  }

  const handleDelete = (id: string, name: string, productCount: number) => {
    if (productCount > 0) {
      toast.error(`Mova os ${productCount} produto(s) desta categoria antes de excluir.`)
      return
    }
    if (!confirm(`Excluir a categoria "${name}"?`)) return
    start(async () => {
      const r = await deleteCategoryAction(id)
      if (r.error) { toast.error(r.error); return }
      setCategories((p) => p.filter((c) => c.id !== id))
      toast.success('Categoria excluída')
    })
  }

  const handleToggle = (id: string, current: boolean) => {
    start(async () => {
      const fd = new FormData()
      fd.set('categoryId', id)
      fd.set('isActive', String(!current))
      const r = await updateCategoryAction(fd)
      if (r.error) { toast.error(r.error); return }
      setCategories((p) => p.map((c) => c.id === id ? { ...c, isActive: !current } : c))
    })
  }

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('image', editImage)
    start(async () => {
      const r = await updateCategoryAction(fd)
      if (r.error) { toast.error(r.error); return }
      toast.success('Categoria atualizada!')
      setEditingId(null)
      window.location.reload()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Nova categoria
        </button>
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Nova categoria</h3>
            <button onClick={() => { setShowForm(false); setNewImage('') }}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          {createState.error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {createState.error}
            </div>
          )}
          <form action={(fd) => { fd.set('image', newImage); createAction(fd) }} className="space-y-4">
            <ImageUpload value={newImage} onChange={setNewImage} onRemove={() => setNewImage('')} type="product" label="Imagem da categoria" />
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome *</label>
              <input name="name" required placeholder="Ex: Pizzas, Hambúrgueres"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Descrição</label>
              <input name="description" placeholder="Breve descrição (opcional)"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowForm(false); setNewImage('') }}
                className="px-4 py-2 text-sm border border-input rounded-lg hover:bg-muted transition-colors">
                Cancelar
              </button>
              <SubmitBtn label="Criar categoria" />
            </div>
          </form>
        </div>
      )}

      {/* Lista */}
      {categories.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">Nenhuma categoria criada ainda</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id}>
              {editingId === cat.id ? (
                // Formulário de edição inline
                <div className="bg-card border-2 border-primary/30 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Editar categoria</h3>
                    <button onClick={() => setEditingId(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
                  </div>
                  <form onSubmit={handleEditSubmit} className="space-y-4">
                    <input type="hidden" name="categoryId" value={cat.id} />
                    <ImageUpload value={editImage || cat.image || ''} onChange={setEditImage} onRemove={() => setEditImage('')} type="product" label="Imagem" />
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Nome *</label>
                      <input name="name" defaultValue={cat.name} required
                        className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Descrição</label>
                      <input name="description" defaultValue={cat.description ?? ''}
                        className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div className="flex gap-3 justify-end">
                      <button type="button" onClick={() => setEditingId(null)}
                        className="px-4 py-2 text-sm border border-input rounded-lg hover:bg-muted transition-colors">
                        Cancelar
                      </button>
                      <button type="submit" disabled={isPending}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
                        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Salvar
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                // Card normal
                <div className={cn('bg-card border border-border rounded-xl p-4 flex items-center gap-3 transition-all', !cat.isActive && 'opacity-60')}>
                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-grab" />
                  {cat.image ? (
                    <img src={cat.image} alt={cat.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-lg">🍽️</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cat._count.products} produto{cat._count.products !== 1 ? 's' : ''}
                      {cat.description && ` • ${cat.description}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleToggle(cat.id, cat.isActive)} disabled={isPending}>
                      {cat.isActive
                        ? <ToggleRight className="h-5 w-5 text-emerald-500" />
                        : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                    </button>
                    <button onClick={() => { setEditingId(cat.id); setEditImage(cat.image ?? '') }}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(cat.id, cat.name, cat._count.products)}
                      disabled={isPending}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-40">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
