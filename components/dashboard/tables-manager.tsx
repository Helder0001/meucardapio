'use client'

// components/dashboard/tables-manager.tsx

import { useState, useTransition, useEffect } from 'react'
import { createTableAction } from '@/actions/tables/create-table'
import { cn } from '@/lib/utils'
import { Plus, QrCode, Table2, Users, Loader2, Download, X } from 'lucide-react'
import { toast } from 'sonner'
import QRCodeLib from 'qrcode'

interface Table {
  id: string
  number: number
  sector: string
  capacity: number
  status: string
  isActive: boolean
  qrCode: string
  pdv: { name: string }
  _count: { orders: number }
}

interface TablesManagerProps {
  tables: Table[]
  pdvs: Array<{ id: string; name: string }>
  tenantSlug: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'Disponível', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  OCCUPIED:  { label: 'Ocupada',    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  RESERVED:  { label: 'Reservada',  color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  CLEANING:  { label: 'Limpeza',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
}

export function TablesManager({ tables, pdvs, tenantSlug }: TablesManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [isPending, startTransition] = useTransition()

  // Agrupar por setor
  const sectors = [...new Set(tables.map((t) => t.sector))].sort()

  const downloadQRCode = async (table: Table) => {
    const url = `${window.location.origin}/menu/${tenantSlug}?table=${table.qrCode}`
    const canvas = document.createElement('canvas')
    await QRCodeLib.toCanvas(canvas, url, { width: 400, margin: 2 })

    // Adicionar label da mesa abaixo do QR Code
    const ctx = canvas.getContext('2d')!
    const newCanvas = document.createElement('canvas')
    newCanvas.width = 400
    newCanvas.height = 460
    const newCtx = newCanvas.getContext('2d')!
    newCtx.fillStyle = '#ffffff'
    newCtx.fillRect(0, 0, 400, 460)
    newCtx.drawImage(canvas, 0, 0)
    newCtx.fillStyle = '#111827'
    newCtx.font = 'bold 24px sans-serif'
    newCtx.textAlign = 'center'
    newCtx.fillText(`Mesa ${table.number} — ${table.sector}`, 200, 440)

    const link = document.createElement('a')
    link.download = `mesa-${table.number}-${table.sector}.png`
    link.href = newCanvas.toDataURL()
    link.click()
    toast.success('QR Code baixado!')
  }

  const handleCreateTable = async (formData: FormData) => {
    startTransition(async () => {
      const result = await createTableAction(formData)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Mesa criada com sucesso!')
        setShowForm(false)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Botão criar mesa */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova mesa
        </button>
      </div>

      {/* Formulário de nova mesa */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Criar nova mesa</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form action={handleCreateTable} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                PDV *
              </label>
              <select
                name="pdvId"
                required
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {pdvs.map((pdv) => (
                  <option key={pdv.id} value={pdv.id}>{pdv.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Número da mesa *
              </label>
              <input
                name="number"
                type="number"
                min="1"
                required
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Setor *
              </label>
              <input
                name="sector"
                type="text"
                required
                placeholder="Ex: Salão, Varanda, Área externa"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Capacidade
              </label>
              <input
                name="capacity"
                type="number"
                min="1"
                defaultValue={4}
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-input rounded-lg hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Criar mesa
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mesas por setor */}
      {sectors.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Table2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma mesa cadastrada</p>
          <p className="text-xs mt-1">Crie mesas para gerar QR Codes e receber pedidos</p>
        </div>
      ) : (
        sectors.map((sector) => (
          <div key={sector}>
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-primary rounded-full" />
              {sector}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {tables
                .filter((t) => t.sector === sector)
                .map((table) => {
                  const statusConfig = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.AVAILABLE
                  const hasActiveOrders = table._count.orders > 0

                  return (
                    <div
                      key={table.id}
                      className={cn(
                        'bg-card border border-border rounded-xl p-4 text-center transition-all hover:border-primary/40 hover:shadow-sm',
                        hasActiveOrders && 'border-orange-300 dark:border-orange-700'
                      )}
                    >
                      <div className="text-2xl font-bold text-foreground mb-1">
                        {table.number}
                      </div>
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-2">
                        <Users className="h-3 w-3" />
                        {table.capacity}
                      </div>
                      <div className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full mb-3',
                        hasActiveOrders
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                          : statusConfig.color
                      )}>
                        {hasActiveOrders ? `${table._count.orders} pedido(s)` : statusConfig.label}
                      </div>

                      {/* Ações */}
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => setSelectedTable(table)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium border border-border rounded-md hover:bg-muted transition-colors"
                          title="Ver QR Code"
                        >
                          <QrCode className="h-3 w-3" />
                          QR
                        </button>
                        <button
                          onClick={() => downloadQRCode(table)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium border border-border rounded-md hover:bg-muted transition-colors"
                          title="Baixar QR Code"
                        >
                          <Download className="h-3 w-3" />
                          PDF
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        ))
      )}

      {/* Modal QR Code */}
      {selectedTable && (
        <QRCodeModal
          table={selectedTable}
          tenantSlug={tenantSlug}
          onClose={() => setSelectedTable(null)}
        />
      )}
    </div>
  )
}

function QRCodeModal({
  table,
  tenantSlug,
  onClose,
}: {
  table: Table
  tenantSlug: string
  onClose: () => void
}) {
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/menu/${tenantSlug}?table=${table.qrCode}`
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
  QRCodeLib.toDataURL(url, { width: 280, margin: 2 })
    .then(setQrDataUrl)
    .catch(console.error)
}, [url])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl p-6 w-80 text-center">
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <h3 className="font-bold text-foreground mb-1">
          Mesa {table.number}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">{table.sector}</p>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR Code" className="mx-auto rounded-xl border border-border" />
        ) : (
          <div className="w-48 h-48 mx-auto bg-muted rounded-xl animate-pulse" />
        )}
        <p className="text-xs text-muted-foreground mt-3 break-all">{url}</p>
      </div>
    </div>
  )
}

