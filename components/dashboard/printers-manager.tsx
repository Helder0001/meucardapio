'use client'

// components/dashboard/printers-manager.tsx

import { useState, useTransition } from 'react'
import { createPrinterAction, deletePrinterAction } from '@/actions/printers/manage-printers'
import { formatRelative } from '@/lib/utils/format'
import { Printer, Plus, Trash2, Copy, Check, Loader2, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface PrinterData {
  id: string
  name: string
  token: string
  sector: string
  isActive: boolean
  lastSeenAt: Date | null
  createdAt: Date
}

const SECTOR_LABELS: Record<string, string> = {
  KITCHEN: '👨‍🍳 Cozinha',
  BAR:     '🍺 Bar',
  COUNTER: '🏪 Balcão',
}

export function PrintersManager({ printers: initial }: { printers: PrinterData[] }) {
  const [printers, setPrinters] = useState(initial)
  const [showForm,  setShowForm] = useState(false)
  const [copied,    setCopied]   = useState<string | null>(null)
  const [isPending, start]       = useTransition()

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(
      `${window.location.origin}/api/printers/${token}`
    )
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
    toast.success('URL da impressora copiada!')
  }

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    start(async () => {
      const result = await createPrinterAction(formData)
      if (result.error) { toast.error(result.error); return }
      toast.success('Impressora criada!')
      setShowForm(false)
      window.location.reload()
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Remover esta impressora?')) return
    start(async () => {
      const result = await deletePrinterAction(id)
      if (result.error) { toast.error(result.error); return }
      setPrinters((prev) => prev.filter((p) => p.id !== id))
      toast.success('Impressora removida')
    })
  }

  const isOnline = (lastSeen: Date | null) => {
    if (!lastSeen) return false
    return Date.now() - new Date(lastSeen).getTime() < 30_000 // online se pingou nos últimos 30s
  }

  return (
    <div className="space-y-5">
      {/* Instruções */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
        <p className="font-semibold mb-1">Como conectar uma impressora:</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Crie a impressora abaixo e copie a URL do token</li>
          <li>No computador conectado à impressora, abra a URL no navegador</li>
          <li>O sistema vai imprimir automaticamente ao receber novos pedidos</li>
          <li>Compatível com qualquer impressora térmica via Windows/Chrome</li>
        </ol>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Nova impressora
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4">Cadastrar impressora</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome *</label>
              <input name="name" required placeholder="Ex: Impressora Cozinha"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Setor *</label>
              <select name="sector" required
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="KITCHEN">👨‍🍳 Cozinha</option>
                <option value="BAR">🍺 Bar</option>
                <option value="COUNTER">🏪 Balcão</option>
              </select>
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-input rounded-lg hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Criar impressora
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista */}
      {printers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Printer className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma impressora cadastrada</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {printers.map((p) => {
            const online = isOnline(p.lastSeenAt)
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{SECTOR_LABELS[p.sector] ?? p.sector}</p>
                  </div>
                  <div className={cn(
                    'flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
                    online
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {online ? <><Wifi className="h-3 w-3" /> Online</> : <><WifiOff className="h-3 w-3" /> Offline</>}
                  </div>
                </div>

                {p.lastSeenAt && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Último contato: {formatRelative(p.lastSeenAt)}
                  </p>
                )}

                {/* Token URL */}
                <div className="flex gap-2">
                  <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground truncate">
                    /api/printers/{p.token.slice(0, 8)}...
                  </div>
                  <button onClick={() => copyToken(p.token)}
                    className="p-2 border border-input rounded-lg hover:bg-muted transition-colors">
                    {copied === p.token
                      ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                      : <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    }
                  </button>
                  <button onClick={() => handleDelete(p.id)} disabled={isPending}
                    className="p-2 border border-input rounded-lg hover:bg-destructive/10 hover:border-destructive/30 transition-colors disabled:opacity-40">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
