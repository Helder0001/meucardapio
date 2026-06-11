'use client'

// components/dashboard/reports-client.tsx
// Gráficos + filtro de período + exportação XLSX e PDF

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import { TrendingUp, TrendingDown, Minus, Download, FileText, FileSpreadsheet, Loader2, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ReportsClientProps {
  revenueChart:  Array<{ date: string; revenue: number; orders: number }>
  topProducts:   Array<{ name: string; quantity: number; revenue: number }>
  salesByType:   Array<{ type: string; total: number; count: number }>
  salesByPayment:Array<{ method: string; total: number; count: number }>
  salesByHour:   Array<{ hour: number; orders: number }>
  summary: {
    thisRevenue:   number
    prevRevenue:   number
    revenueGrowth: number
    totalOrders:   number
    avgTicket:     number
  }
  startDate: string
  endDate:   string
}

const TYPE_LABELS: Record<string, string> = {
  DELIVERY: '🛵 Delivery',
  TABLE:    '🍽️ Mesa',
  PICKUP:   '🏪 Retirada',
  PDV:      '💳 Balcão',
}

const METHOD_LABELS: Record<string, string> = {
  PIX:         '⚡ PIX',
  CASH:        '💵 Dinheiro',
  CREDIT_CARD: '💳 Crédito',
  DEBIT_CARD:  '💳 Débito',
  CARD:        '💳 Cartão',
  VOUCHER:     '🎟️ Voucher',
}

const PIE_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e', '#eab308']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === 'revenue' ? formatCurrency(p.value) : `${p.value} pedidos`}
        </p>
      ))}
    </div>
  )
}

export function ReportsClient({
  revenueChart, topProducts, salesByType, salesByPayment,
  salesByHour, summary, startDate, endDate,
}: ReportsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [start, setStart] = useState(startDate)
  const [end,   setEnd]   = useState(endDate)
  const [exporting, setExporting] = useState<string | null>(null)

  const growthPositive = summary.revenueGrowth > 0
  const growthNeutral  = summary.revenueGrowth === 0

  // Aplicar filtro de datas
  const applyFilter = () => {
    startTransition(() => {
      router.push(`/dashboard/reports?start=${start}&end=${end}`)
    })
  }

  // Atalhos de período
  const setPreset = (days: number) => {
    const e = new Date()
    const s = new Date(Date.now() - days * 86400000)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    setStart(fmt(s))
    setEnd(fmt(e))
    startTransition(() => {
      router.push(`/dashboard/reports?start=${fmt(s)}&end=${fmt(e)}`)
    })
  }

  const setCurrentMonth = () => {
    const now = new Date()
    const s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const e = now.toISOString().slice(0, 10)
    setStart(s); setEnd(e)
    startTransition(() => router.push(`/dashboard/reports?start=${s}&end=${e}`))
  }

  // Exportação
  const exportFile = async (format: 'xlsx' | 'pdf', type: string, label: string) => {
    const key = `${type}-${format}`
    setExporting(key)
    try {
      const params = new URLSearchParams({ type, format, start: startDate, end: endDate })
      const res = await fetch(`/api/reports/export?${params}`)
      if (!res.ok) { toast.error('Erro ao exportar'); return }

      if (format === 'pdf') {
        const html = await res.text()
        const win = window.open('', '_blank')
        if (win) { win.document.write(html); win.document.close() }
        return
      }

      // XLSX — download direto
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const filename = res.headers.get('content-disposition')
        ?.match(/filename="(.+?)"/)?.[1] ?? `${type}.xlsx`
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
      toast.success(`${label} exportado!`)
    } catch { toast.error('Erro ao exportar') }
    finally { setExporting(null) }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Análise de desempenho do seu estabelecimento
        </p>
      </div>

      {/* ── Filtro de período ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Período</span>
          </div>

          {/* Atalhos */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Hoje',      action: () => setPreset(0) },
              { label: '7 dias',    action: () => setPreset(7) },
              { label: '30 dias',   action: () => setPreset(30) },
              { label: 'Este mês',  action: setCurrentMonth },
              { label: '90 dias',   action: () => setPreset(90) },
            ].map((p) => (
              <button key={p.label} onClick={p.action}
                className="px-2.5 py-1 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                {p.label}
              </button>
            ))}
          </div>

          {/* Inputs de data */}
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-muted-foreground text-sm">até</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            <button onClick={applyFilter} disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Aplicar
            </button>
          </div>
        </div>
      </div>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground mb-1">Faturamento no período</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.thisRevenue)}</p>
          <div className={cn('flex items-center gap-1 mt-1 text-xs font-medium',
            growthPositive ? 'text-emerald-600' : growthNeutral ? 'text-muted-foreground' : 'text-red-500')}>
            {growthPositive ? <TrendingUp className="h-3 w-3" /> :
             growthNeutral  ? <Minus className="h-3 w-3" /> :
                              <TrendingDown className="h-3 w-3" />}
            {Math.abs(summary.revenueGrowth).toFixed(1)}% vs período anterior
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground mb-1">Pedidos no período</p>
          <p className="text-2xl font-bold text-foreground">{summary.totalOrders}</p>
          <p className="text-xs text-muted-foreground mt-1">pedidos pagos</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground mb-1">Ticket médio</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.avgTicket)}</p>
          <p className="text-xs text-muted-foreground mt-1">por pedido</p>
        </div>
      </div>

      {/* ── Gráfico de faturamento ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-5">Faturamento diário</h2>
        {revenueChart.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => `R$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="revenue" name="revenue" stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top produtos */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Produtos mais vendidos</h2>
          {topProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {topProducts.slice(0, 8).map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-muted-foreground text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="h-1.5 rounded-full bg-orange-500"
                        style={{ width: `${(p.quantity / (topProducts[0]?.quantity || 1)) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-foreground">{p.quantity} un</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(p.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vendas por tipo */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Vendas por tipo</h2>
          {salesByType.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={salesByType} dataKey="total" nameKey="type" cx="50%" cy="50%" outerRadius={80}
                  label={({ name, percent }) => `${TYPE_LABELS[name] ?? name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {salesByType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => typeof v === 'number' ? formatCurrency(v) : v} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Vendas por forma de pagamento */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-4">Formas de pagamento</h2>
        {salesByPayment.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {salesByPayment.map((s, i) => (
              <div key={s.method} className="rounded-xl border border-border p-4">
                <p className="text-sm font-medium text-foreground mb-1">{METHOD_LABELS[s.method] ?? s.method}</p>
                <p className="text-lg font-bold" style={{ color: PIE_COLORS[i % PIE_COLORS.length] }}>
                  {formatCurrency(s.total)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.count} pagamento{s.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pico por horário */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-5">Pico de pedidos por horário</h2>
        {salesByHour.length === 0 ? (
          <div className="h-36 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={salesByHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(h) => `${h}h`} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
              <Tooltip
                formatter={(v) => typeof v === 'number' ? [`${v} pedidos`, 'Pedidos'] : [v, 'Pedidos']}
                labelFormatter={(h) => `${h}:00h`}
              />
              <Bar dataKey="orders" fill="#f97316" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Exportação ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-1">Exportar relatórios</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Exportando o período: {startDate} a {endDate}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {([
            { type: 'orders',   format: 'xlsx', label: 'Pedidos',      icon: FileSpreadsheet, color: 'text-emerald-600' },
            { type: 'revenue',  format: 'xlsx', label: 'Faturamento',  icon: FileSpreadsheet, color: 'text-emerald-600' },
            { type: 'products', format: 'xlsx', label: 'Produtos',     icon: FileSpreadsheet, color: 'text-emerald-600' },
            { type: 'orders',   format: 'pdf',  label: 'Pedidos',      icon: FileText,        color: 'text-red-500' },
            { type: 'revenue',  format: 'pdf',  label: 'Faturamento',  icon: FileText,        color: 'text-red-500' },
            { type: 'products', format: 'pdf',  label: 'Produtos',     icon: FileText,        color: 'text-red-500' },
          ] as const).map((exp) => {
            const key = `${exp.type}-${exp.format}`
            const isLoading = exporting === key
            const Icon = exp.icon
            return (
              <button key={key} onClick={() => exportFile(exp.format, exp.type, exp.label)}
                disabled={!!exporting}
                className="flex flex-col items-center gap-2 p-4 border border-border rounded-xl hover:bg-muted/50 disabled:opacity-60 transition-colors text-center">
                {isLoading
                  ? <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  : <Icon className={cn('h-5 w-5', exp.color)} />}
                <div>
                  <p className="text-xs font-semibold text-foreground">{exp.label}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{exp.format}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
