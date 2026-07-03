'use client'

// components/dashboard/delivery-zones-manager.tsx

import { useState, useTransition } from 'react'
import { createDeliveryZoneAction, deleteDeliveryZoneAction } from '@/actions/delivery/manage-zones'
import { formatCurrency } from '@/lib/utils/format'
import { Plus, Trash2, Loader2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Zone {
  id: string
  name: string | null
  bairro: string | null
  fee: number
  freeAbove: number | null
  minOrder: number | null
  maxTime: number | null
  isActive: boolean
}

export function DeliveryZonesManager({ zones: initial }: { zones: Zone[] }) {
  const [zones,    setZones]    = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [isPending, start]      = useTransition()

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    start(async () => {
      const result = await createDeliveryZoneAction(formData)
      if (result.error) { toast.error(result.error); return }
      toast.success('Zona criada!')
      setShowForm(false)
      window.location.reload()
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Remover esta zona de entrega?')) return
    start(async () => {
      const result = await deleteDeliveryZoneAction(id)
      if (result.error) { toast.error(result.error); return }
      setZones((prev) => prev.filter((z) => z.id !== id))
      toast.success('Zona removida')
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Adicionar bairro
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4">Novo bairro/zona de entrega</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome do bairro *</label>
              <input name="bairro" required placeholder="Ex: Centro" className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome amigável</label>
              <input name="name" placeholder="Ex: Centro e adjacências" className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Taxa de entrega (R$) *</label>
              <input name="fee" type="number" step="0.50" min="0" required defaultValue="5.00" className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Grátis acima de (R$)</label>
              <input name="freeAbove" type="number" step="0.01" min="0" placeholder="Sem mínimo" className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Pedido mínimo (R$)</label>
              <input name="minOrder" type="number" step="0.01" min="0" placeholder="Sem mínimo" className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Tempo máximo (min)</label>
              <input name="maxTime" type="number" min="1" placeholder="Ex: 45" className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-input rounded-lg hover:bg-muted transition-colors">Cancelar</button>
              <button type="submit" disabled={isPending} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar zona
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista */}
      {zones.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma zona de entrega configurada</p>
          <p className="text-xs mt-1">Adicione os bairros onde você faz entrega</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Bairro', 'Taxa', 'Grátis acima', 'Pedido mínimo', 'Tempo', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{zone.bairro}</p>
                    {zone.name && zone.name !== zone.bairro && (
                      <p className="text-xs text-muted-foreground">{zone.name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {zone.fee === 0 ? <span className="text-emerald-600">Grátis</span> : formatCurrency(zone.fee)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {zone.freeAbove ? formatCurrency(zone.freeAbove) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {zone.minOrder ? formatCurrency(zone.minOrder) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {zone.maxTime ? `${zone.maxTime} min` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(zone.id)}
                      disabled={isPending}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
