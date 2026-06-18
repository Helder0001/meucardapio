'use client'

// components/dashboard/reports-client.tsx
// Gráficos + filtro de período + filtros avançados + exportação XLSX e PDF

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import {
  TrendingUp, TrendingDown, Minus, FileText, FileSpreadsheet,
  Loader2, Calendar, SlidersHorizontal, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ReportsClientProps {
  revenueChart:  Array<{ date: string; revenue: number; orders: number }>
  topProducts:   Array<{ id: string; name: string; quantity: number; revenue: number }>
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
  // Listas para os filtros
  pdvList:     Array<{ id: string; name: string }>
  productList: Array<{ id: string; name: string }>
  // Valores atuais dos filtros
  filterPdv:      string
  filterPayment:  string
  filterProduct:  string
  filterSaleType: string
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
  VOUCHER:     '🎟️ Voucher',
}

const METHOD_OPTIONS = [
  { value: '',            label: 'Todas' },
  { value: 'PIX',        label: '⚡ PIX' },
  { value: 'CASH',       label: '💵 Dinheiro' },
  { value: 'CREDIT_CARD',label: '💳 Crédito' },
  { value: 'DEBIT_CARD', label: '💳 Débito' },
  { value: 'VOUCHER',    label: '🎟️ Voucher' },
]

const TYPE_OPTIONS = [
  { value: '',         label: 'Todos' },
  { value: 'DELIVERY', label: '🛵 Delivery' },
  { value: 'TABLE',    label: '🍽️ Mesa' },
  { value: 'PICKUP',   label: '🏪 Retirada' },
  { value: 'PDV',      label: '💳 Balcão' },
]

// Normaliza 'CARD' legado para 'CREDIT_CARD'
const normalizeMethod = (m: string) => m === 'CARD' ? 'CREDIT_CARD' : m

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

const SelectFilter = ({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) => (
  <div className="flex flex-col gap-1 min-w-[140px]">
    <label className="text-xs font-medium text-muted-foreground">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
)

export function ReportsClient({
  revenueChart, topProducts, salesByType, salesByPayment,
  salesByHour, summary, startDate, endDate,
  pdvList, productList,
  filterPdv, filterPayment, filterProduct, filterSaleType,
}: ReportsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [start, setStart] = useState(startDate)
  const [end,   setEnd]   = useState(endDate)
  const [exporting, setExporting] = useState<string | null>(null)

  // Estado local dos filtros avançados
  const [pdv,      setPdv]      = useState(filterPdv)
  const [payment,  setPayment]  = useState(filterPayment)
  const [product,  setProduct]  = useState(filterProduct)
  const [saleType, setSaleType] = useState(filterSaleType)
  const [showAdvanced, setShowAdvanced] = useState(
    !!(filterPdv || filterPayment || filterProduct || filterSaleType)
  )

  const growthPositive = summary.revenueGrowth > 0
  const growthNeutral  = summary.revenueGrowth === 0

  const buildUrl = (s: string, e: string, p = pdv, pay = payment, prod = product, st = saleType) => {
    const q = new URLSearchParams({ start: s, end: e })
    if (p)   q.set('pdv',      p)
    if (pay) q.set('payment',  pay)
    if (prod)q.set('product',  prod)
    if (st)  q.set('saleType', st)
    return `/dashboard/reports?${q.toString()}`
  }

  // Aplicar todos os filtros
  const applyFilter = () => {
    startTransition(() => router.push(buildUrl(start, end)))
  }

  // Atalhos de período (mantém filtros avançados)
  const setPreset = (days: number) => {
    const e = new Date()
    const s = new Date(Date.now() - days * 86400000)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    setStart(fmt(s)); setEnd(fmt(e))
    startTransition(() => router.push(buildUrl(fmt(s), fmt(e))))
  }

  const setCurrentMonth = () => {
    const now = new Date()
    const s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const e = now.toISOString().slice(0, 10)
    setStart(s); setEnd(e)
    startTransition(() => router.push(buildUrl(s, e)))
  }

  const clearAdvanced = () => {
    setPdv(''); setPayment(''); setProduct(''); setSaleType('')
    startTransition(() => router.push(buildUrl(start, end, '', '', '', '')))
  }

  const hasActiveFilters = !!(pdv || payment || product || saleType)

  // Exportação
  const exportFile = async (format: 'xlsx' | 'pdf', type: string, label: string) => {
    const key = `${type}-${format}`
    setExporting(key)
    try {
      const params = new URLSearchParams({ type, format, start: startDate, end: endDate })
      const res = await fetch(`/api/reports/export?${params}`)
      if (!res.ok) {
        let message = 'Erro ao exportar'
        try { const d = await res.json(); if (d?.error) message = d.error } catch {}
        toast.error(message)
        return
      }
      if (format === 'pdf') {
        const html = await res.text()
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href = url; a.target = '_blank'
        document.body.appendChild(a); a.click()
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 1000)
        toast.success('PDF aberto — use Ctrl+P para imprimir/salvar')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const cd   = res.headers.get('content-disposition')
      const filename = cd?.match(/filename="(.+?)"/)?.[1] ?? `${type}.xlsx`
      const a    = document.createElement('a')
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 1000)
      toast.success(`${label} exportado!`)
    } catch {
      toast.error('Erro ao exportar relatório')
    } finally {
      setExporting(null)
    }
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

      {/* ── Filtros ── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        {/* Filtro de período */}
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
          <div className="flex items-center gap-2 ml-auto flex-wrap">
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

        {/* Toggle filtros avançados */}
        <div className="border-t border-border pt-3">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros avançados
            {hasActiveFilters && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-primary text-primary-foreground rounded-full leading-none">
                {[pdv, payment, product, saleType].filter(Boolean).length}
              </span>
            )}
            {showAdvanced
              ? <ChevronUp className="h-3.5 w-3.5 ml-auto" />
              : <ChevronDown className="h-3.5 w-3.5 ml-auto" />
            }
          </button>

          {showAdvanced && (
            <div className="mt-3 flex flex-wrap gap-4 items-end">
              {/* PDV */}
              <SelectFilter
                label="PDV"
                value={pdv}
                onChange={setPdv}
                options={[
                  { value: '', label: 'Todos os PDVs' },
                  ...pdvList.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />

              {/* Forma de pagamento */}
              <SelectFilter
                label="Forma de pagamento"
                value={payment}
                onChange={setPayment}
                options={METHOD_OPTIONS}
              />

              {/* Produto */}
              <SelectFilter
                label="Produto"
                value={product}
                onChange={setProduct}
                options={[
                  { value: '', label: 'Todos os produtos' },
                  ...productList.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />

              {/* Tipo de venda */}
              <SelectFilter
                label="Tipo de venda"
                value={saleType}
                onChange={setSaleType}
                options={TYPE_OPTIONS}
              />

              <div className="flex gap-2 pb-0.5">
                <button
                  onClick={applyFilter}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Filtrar
                </button>
                {hasActiveFilters && (
                  <button
                    onClick={clearAdvanced}
                    className="px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          )}
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
          <p className="text-xs text-muted-foreground mt-1">pedidos não cancelados</p>
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
                <div key={p.id} className="flex items-center gap-3">
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
            <ResponsiveContainer width="100%" height={salesByType.length >= 3 ? 280 : 220}>
              <PieChart>
                <Pie
                  data={salesByType}
                  dataKey="total"
                  nameKey="type"
                  cx="50%"
                  cy="45%"
                  outerRadius={75}
                  label={false}
                >
                  {salesByType.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                      name={TYPE_LABELS[entry.type] ?? entry.type}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => typeof v === 'number' ? formatCurrency(v) : v} />
                <Legend
                  formatter={(value) => TYPE_LABELS[value] ?? value}
                  wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                />
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
            {Object.entries(
              salesByPayment.reduce((acc, s) => {
                const key = normalizeMethod(s.method)
                if (!acc[key]) acc[key] = { total: 0, count: 0 }
                acc[key].total += s.total
                acc[key].count += s.count
                return acc
              }, {} as Record<string, { total: number; count: number }>)
            ).map(([method, data], i) => (
              <div key={method} className="rounded-xl border border-border p-4">
                <p className="text-sm font-medium text-foreground mb-1">{METHOD_LABELS[method] ?? method}</p>
                <p className="text-lg font-bold" style={{ color: PIE_COLORS[i % PIE_COLORS.length] }}>
                  {formatCurrency(data.total)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{data.count} pagamento{data.count !== 1 ? 's' : ''}</p>
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
