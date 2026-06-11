'use client'
// components/dashboard/reports-export.tsx
// Botões para exportar relatórios em CSV e PDF

import { useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ReportsExportProps {
  startDate?: string
  endDate?:   string
}

export function ReportsExport({ startDate, endDate }: ReportsExportProps) {
  const [loading, setLoading] = useState<string | null>(null)

  const download = async (type: string, format: string, label: string) => {
    setLoading(`${type}-${format}`)
    try {
      const params = new URLSearchParams({ type, format })
      if (startDate) params.set('start', startDate)
      if (endDate)   params.set('end',   endDate)

      const res = await fetch(`/api/reports/export?${params}`)
      if (!res.ok) { toast.error('Erro ao exportar'); return }

      if (format === 'pdf') {
        // Abrir HTML em nova aba (dispara print automático)
        const html = await res.text()
        const win  = window.open('', '_blank')
        if (win) { win.document.write(html); win.document.close() }
        return
      }

      // Download de arquivo CSV
      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      const filename = res.headers.get('content-disposition')
        ?.match(/filename="(.+?)"/)?.[1] ?? `${type}.csv`
      a.href         = url
      a.download     = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${label} exportado!`)
    } catch {
      toast.error('Erro ao exportar. Tente novamente.')
    } finally {
      setLoading(null)
    }
  }

  const exports = [
    { type: 'orders',   format: 'csv', label: 'Pedidos CSV',          icon: Download },
    { type: 'revenue',  format: 'csv', label: 'Faturamento CSV',      icon: Download },
    { type: 'products', format: 'csv', label: 'Produtos CSV',         icon: Download },
    { type: 'orders',   format: 'pdf', label: 'Relatório PDF',        icon: FileText },
  ]

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="font-semibold text-foreground mb-4">Exportar relatórios</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {exports.map((exp) => {
          const key     = `${exp.type}-${exp.format}`
          const isLoading = loading === key
          const Icon    = exp.icon
          return (
            <button
              key={key}
              onClick={() => download(exp.type, exp.format, exp.label)}
              disabled={isLoading || !!loading}
              className="flex flex-col items-center gap-2 p-4 border border-border rounded-xl hover:bg-muted/50 disabled:opacity-60 transition-colors text-center"
            >
              {isLoading
                ? <Loader2 className="h-5 w-5 text-primary animate-spin" />
                : <Icon className="h-5 w-5 text-muted-foreground" />
              }
              <span className="text-xs text-foreground font-medium">{exp.label}</span>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Os arquivos CSV abrem diretamente no Excel, Google Sheets e LibreOffice.
      </p>
    </div>
  )
}
