'use client'

// components/dashboard/reports-client.tsx
// Design renovado — fiel ao mockup: KPIs, Insights, produtos, origem, pagamentos, horário, clientes, exportação

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot,
} from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import {
  TrendingUp, TrendingDown, Minus, FileText, FileSpreadsheet,
  Loader2, Calendar, SlidersHorizontal, ChevronDown, ChevronUp,
  ShoppingBag, DollarSign, Users, Receipt, CreditCard,
  Flame, Clock, Pizza, HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ReportsClientProps {
  revenueChart:   Array<{ date: string; revenue: number; orders: number }>
  revenueChartPrev?: Array<{ date: string; revenue: number }>
  topProducts:    Array<{ id: string; name: string; quantity: number; revenue: number }>
  salesByType:    Array<{ type: string; total: number; count: number }>
  salesByPayment: Array<{ method: string; total: number; count: number }>
  salesByHour:    Array<{ hour: number; orders: number }>
  summary: {
    thisRevenue:   number
    prevRevenue:   number
    revenueGrowth: number
    totalOrders:   number
    prevOrders?:   number
    avgTicket:     number
    prevAvgTicket?: number
    totalClients?:  number
    newClients?:    number
    returningClients?: number
    returnRate?:    number
  }
  startDate: string
  endDate:   string
  pdvList:     Array<{ id: string; name: string }>
  productList: Array<{ id: string; name: string }>
  userList:    Array<{ id: string; name: string; role: string }>
  filterPdv:      string
  filterPayment:  string
  filterProduct:  string
  filterSaleType: string
  filterUser:     string
}

const TYPE_LABELS: Record<string, string> = {
  DELIVERY: 'Delivery',
  TABLE:    'Mesa',
  PICKUP:   'Retirada',
  PDV:      'Balcão',
}

const ROLE_LABELS_SHORT: Record<string, string> = {
  TENANT_ADMIN: 'Admin', MANAGER: 'Gerente',
  ATTENDANT: 'Atendente', STAFF: 'Operador', DELIVERY_PERSON: 'Entregador',
}

const METHOD_LABELS: Record<string, string> = {
  PIX:                'PIX',
  CASH:               'Dinheiro',
  CREDIT_CARD:        'Crédito',
  CREDIT_CARD_MANUAL: 'Crédito (entrega)',
  DEBIT_CARD:         'Débito',
  VOUCHER:            'Voucher',
}

const METHOD_OPTIONS = [
  { value: '',                    label: 'Todas' },
  { value: 'PIX',                 label: '⚡ PIX' },
  { value: 'CASH',                label: '💵 Dinheiro' },
  { value: 'CREDIT_CARD',         label: '💳 Crédito' },
  { value: 'CREDIT_CARD_MANUAL',  label: '💳 Crédito (entrega)' },
  { value: 'DEBIT_CARD',          label: '💳 Débito' },
  { value: 'VOUCHER',             label: '🎟️ Voucher' },
]

const TYPE_OPTIONS = [
  { value: '',         label: 'Todos' },
  { value: 'DELIVERY', label: '🛵 Delivery' },
  { value: 'TABLE',    label: '🍽️ Mesa' },
  { value: 'PICKUP',   label: '🏪 Retirada' },
  { value: 'PDV',      label: '💳 Balcão' },
]

const normalizeMethod = (m: string) => m === 'CARD' ? 'CREDIT_CARD' : m

const METHOD_COLORS: Record<string, string> = {
  CREDIT_CARD:        '#8b5cf6',
  CREDIT_CARD_MANUAL: '#a78bfa',
  DEBIT_CARD:         '#3b82f6',
  PIX:                '#10b981',
  CASH:               '#f59e0b',
  VOUCHER:            '#f43f5e',
}

const TYPE_COLORS: Record<string, string> = {
  TABLE:    '#10b981',
  PICKUP:   '#3b82f6',
  DELIVERY: '#f97316',
  PDV:      '#8b5cf6',
}

// Tooltip do gráfico de linha
const RevenueTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-1">{label?.slice(5)}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name === 'Período atual' ? formatCurrency(p.value) : formatCurrency(p.value)}
          <span className="ml-1 text-muted-foreground">— {p.name}</span>
        </p>
      ))}
    </div>
  )
}

function GrowthBadge({ value, className }: { value: number; className?: string }) {
  const pos = value > 0
  const neu = value === 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs font-semibold',
      pos ? 'text-emerald-600' : neu ? 'text-muted-foreground' : 'text-red-500',
      className,
    )}>
      {pos ? <TrendingUp className="h-3 w-3" /> : neu ? <Minus className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}% vs período anterior
    </span>
  )
}

// Formata uma data ISO (YYYY-MM-DD) para dd/mm/yyyy
function formatDateBR(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Ícone de "?" que mostra, ao passar o mouse, qual período está sendo
// comparado (o período imediatamente anterior, com a mesma duração do
// período selecionado nos filtros).
function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex ml-auto">
      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
      {/* Centralizado sob o ícone (em vez de ancorado à direita) para não
          estourar a tela em telas pequenas, e com largura limitada ao
          viewport para nunca ficar cortado nas laterais. */}
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-5 z-20 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover text-popover-foreground text-[11px] leading-snug p-2 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity">
        {text}
      </span>
    </span>
  )
}

const SelectFilter = ({
  label, value, onChange, options,
}: {
  label: string; value: string
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
  revenueChart, revenueChartPrev = [], topProducts, salesByType, salesByPayment,
  salesByHour, summary, startDate, endDate,
  pdvList, productList, userList,
  filterPdv, filterPayment, filterProduct, filterSaleType, filterUser,
}: ReportsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [start, setStart] = useState(startDate)
  const [end,   setEnd]   = useState(endDate)
  const [exporting, setExporting] = useState<string | null>(null)

  const [pdv,      setPdv]      = useState(filterPdv)
  const [payment,  setPayment]  = useState(filterPayment)
  const [product,  setProduct]  = useState(filterProduct)
  const [saleType, setSaleType] = useState(filterSaleType)
  const [user,     setUser]     = useState(filterUser)
  const [showAdvanced, setShowAdvanced] = useState(
    !!(filterPdv || filterPayment || filterProduct || filterSaleType || filterUser)
  )
  const [activePreset, setActivePreset] = useState<string>('')

  const buildUrl = (s: string, e: string, p = pdv, pay = payment, prod = product, st = saleType, u = user) => {
    const q = new URLSearchParams({ start: s, end: e })
    if (p)   q.set('pdv',      p)
    if (pay) q.set('payment',  pay)
    if (prod)q.set('product',  prod)
    if (st)  q.set('saleType', st)
    if (u)   q.set('user',     u)
    return `/dashboard/reports?${q.toString()}`
  }

  const applyFilter = () => {
    startTransition(() => router.push(buildUrl(start, end)))
  }

  const setPreset = (label: string, days: number) => {
    const e = new Date()
    const s = days === 0 ? new Date() : new Date(Date.now() - days * 86400000)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    setStart(fmt(s)); setEnd(fmt(e)); setActivePreset(label)
    startTransition(() => router.push(buildUrl(fmt(s), fmt(e))))
  }

  const setCurrentMonth = () => {
    const now = new Date()
    const s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const e = now.toISOString().slice(0, 10)
    setStart(s); setEnd(e); setActivePreset('Este mês')
    startTransition(() => router.push(buildUrl(s, e)))
  }

  const clearAdvanced = () => {
    setPdv(''); setPayment(''); setProduct(''); setSaleType(''); setUser('')
    startTransition(() => router.push(buildUrl(start, end, '', '', '', '', '')))
  }

  const hasActiveFilters = !!(pdv || payment || product || saleType)

  // Período anterior (mesma duração, imediatamente antes do período selecionado)
  // — replica o cálculo do servidor para exibir no tooltip dos cards.
  const periodLenMs = new Date(end).getTime() - new Date(start).getTime()
  const prevStartDate = new Date(new Date(start).getTime() - periodLenMs)
  const prevEndDate   = new Date(new Date(start).getTime() - 86400000)
  const comparisonPeriodText = `Comparado com o período anterior de mesma duração: ${formatDateBR(prevStartDate.toISOString().slice(0, 10))} a ${formatDateBR(prevEndDate.toISOString().slice(0, 10))}.`


  // Merging revenueChart + prevChart pelo índice (alinha por posição)
  const mergedChart = revenueChart.map((d, i) => ({
    ...d,
    prevRevenue: revenueChartPrev[i]?.revenue ?? null,
  }))

  // Melhor e pior dia
  const bestDay  = revenueChart.length ? revenueChart.reduce((a, b) => b.revenue > a.revenue ? b : a) : null
  const worstDay = revenueChart.length ? revenueChart.reduce((a, b) => b.revenue < a.revenue ? b : a) : null

  // Hora de pico
  const peakHour = salesByHour.length ? salesByHour.reduce((a, b) => b.orders > a.orders ? b : a) : null
  const avgOrders = salesByHour.length
    ? Math.round(salesByHour.reduce((s, h) => s + h.orders, 0) / salesByHour.length)
    : 0

  // Total de pedidos para calcular %
  const totalOrdersAll = salesByType.reduce((s, t) => s + t.count, 0) || 1
  const totalPaymentAll = Object.values(
    salesByPayment.reduce((acc, s) => {
      const key = normalizeMethod(s.method)
      acc[key] = (acc[key] ?? 0) + s.total
      return acc
    }, {} as Record<string, number>)
  ).reduce((a, b) => a + b, 0) || 1

  // Produto top
  const topProduct = topProducts[0]
  const topProductPct = topProducts.length > 0
    ? Math.round((topProducts[0].quantity / topProducts.reduce((s, p) => s + p.quantity, 0)) * 100)
    : 0

  // Forma de pagamento dominante
  const paymentMerged = Object.entries(
    salesByPayment.reduce((acc, s) => {
      const key = normalizeMethod(s.method)
      if (!acc[key]) acc[key] = { total: 0, count: 0 }
      acc[key].total += s.total
      acc[key].count += s.count
      return acc
    }, {} as Record<string, { total: number; count: number }>)
  ).sort((a, b) => b[1].total - a[1].total)

  const topPayment = paymentMerged[0]
  const topPaymentPct = topPayment
    ? Math.round((topPayment[1].total / totalPaymentAll) * 100)
    : 0

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

  const presets = [
    { label: 'Hoje',       action: () => setPreset('Hoje', 0) },
    { label: '7 dias',     action: () => setPreset('7 dias', 7) },
    { label: '30 dias',    action: () => setPreset('30 dias', 30) },
    { label: 'Este mês',   action: setCurrentMonth },
    ]

  return (
    <div className="space-y-5 pb-10">
      {/* ── Cabeçalho ── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Visão geral do seu negócio</p>
      </div>

      {/* ── Cards KPI ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Faturamento</span>
            <InfoTooltip text={comparisonPeriodText} />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.thisRevenue)}</p>
          <GrowthBadge value={summary.revenueGrowth} className="mt-1.5" />
        </div>

        {/* Pedidos */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Pedidos</span>
            <InfoTooltip text={comparisonPeriodText} />
          </div>
          <p className="text-2xl font-bold text-foreground">{summary.totalOrders}</p>
          {summary.prevOrders != null && (
            <GrowthBadge
              value={summary.prevOrders > 0
                ? ((summary.totalOrders - summary.prevOrders) / summary.prevOrders) * 100
                : 0}
              className="mt-1.5"
            />
          )}
        </div>

        {/* Ticket médio */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Ticket médio</span>
            <InfoTooltip text={comparisonPeriodText} />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.avgTicket)}</p>
          {summary.prevAvgTicket != null && (
            <GrowthBadge
              value={summary.prevAvgTicket > 0
                ? ((summary.avgTicket - summary.prevAvgTicket) / summary.prevAvgTicket) * 100
                : 0}
              className="mt-1.5"
            />
          )}
        </div>

        {/* Clientes */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Users className="h-5 w-5 text-orange-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Clientes</span>
            <InfoTooltip text="Total de clientes únicos que compraram dentro do período selecionado. O % de retorno indica quantos desses já eram clientes antes desse período." />
          </div>
          <p className="text-2xl font-bold text-foreground">{summary.totalClients ?? '—'}</p>
          {summary.returnRate != null && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 mt-1.5">
              <TrendingUp className="h-3 w-3" />
              {summary.returnRate.toFixed(0)}% de retorno
            </span>
          )}
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={p.action}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
                activePreset === p.label
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setActivePreset('Personalizado') }}
              className="px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-muted-foreground text-sm">até</span>
            <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setActivePreset('Personalizado') }}
              className="px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            <button onClick={applyFilter} disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Aplicar filtro
            </button>
          </div>
        </div>

        {/* Filtros avançados */}
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
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
          </button>
          {showAdvanced && (
            <div className="mt-3 flex flex-wrap gap-4 items-end">
              <SelectFilter label="PDV" value={pdv} onChange={setPdv}
                options={[
                  { value: '', label: 'Todos os PDVs' },
                  { value: 'null', label: '🌐 Online (sem PDV)' },
                  ...pdvList.map((p) => ({ value: p.id, label: p.name })),
                ]} />
              <SelectFilter label="Forma de pagamento" value={payment} onChange={setPayment} options={METHOD_OPTIONS} />
              <SelectFilter label="Produto" value={product} onChange={setProduct}
                options={[
                  { value: '', label: 'Todos os produtos' },
                  ...productList.map((p) => ({ value: p.id, label: p.name })),
                ]} />
              <SelectFilter label="Usuário" value={user} onChange={setUser}
                options={[
                  { value: '', label: 'Todos os usuários' },
                  ...userList.map((u) => ({
                    value: u.id,
                    label: `${u.name} (${ROLE_LABELS_SHORT[u.role] ?? u.role})`,
                  })),
                ]} />
              <SelectFilter label="Tipo de venda" value={saleType} onChange={setSaleType} options={TYPE_OPTIONS} />
              <div className="flex gap-2 pb-0.5">
                <button onClick={applyFilter} disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Filtrar
                </button>
                {hasActiveFilters && (
                  <button onClick={clearAdvanced}
                    className="px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                    Limpar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Gráfico faturamento diário ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-foreground">Faturamento diário</h2>
        </div>
        <div className="flex items-center gap-5 text-xs text-muted-foreground mb-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0.5 bg-orange-500" />
            Período atual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed border-muted-foreground/50" />
            Período anterior
          </span>
        </div>
        {revenueChart.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
            Sem dados no período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={mergedChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickFormatter={(v) => v.slice(5).replace('-', '/')} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <Tooltip content={<RevenueTooltip />} />
              {/* Período anterior — tracejado */}
              <Line
                type="monotone" dataKey="prevRevenue" name="Período anterior"
                stroke="var(--muted-foreground)" strokeWidth={1.5}
                strokeDasharray="5 5" dot={false} connectNulls
              />
              {/* Período atual */}
              <Line
                type="monotone" dataKey="revenue" name="Período atual"
                stroke="#f97316" strokeWidth={2.5} dot={false}
                activeDot={{ r: 5, fill: '#f97316' }}
              />
              {/* Marcadores melhor/pior dia */}
              {bestDay && (
                <ReferenceDot
                  x={bestDay.date} y={bestDay.revenue}
                  r={6} fill="#f97316" stroke="#fff" strokeWidth={2}
                  label={{ value: `🔥 Melhor\n${bestDay.date.slice(5).replace('-', '/')} – ${formatCurrency(bestDay.revenue)}`, position: 'top', fontSize: 10, fill: '#f97316' }}
                />
              )}
              {worstDay && bestDay && worstDay.date !== bestDay.date && (
                <ReferenceDot
                  x={worstDay.date} y={worstDay.revenue}
                  r={5} fill="#ef4444" stroke="#fff" strokeWidth={2}
                  label={{ value: `↓ Menor\n${worstDay.date.slice(5).replace('-', '/')} – ${formatCurrency(worstDay.revenue)}`, position: 'insideBottom', fontSize: 10, fill: '#ef4444' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Insights ── */}
      {(topProduct || peakHour || topPayment) && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Insights do período</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium mb-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Faturamento cresceu
                <InfoTooltip text={`Variação do faturamento total do período em relação ao período anterior. ${comparisonPeriodText}`} />
              </div>
              <p className="text-3xl font-bold text-foreground">{Math.abs(summary.revenueGrowth).toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">em relação ao período anterior</p>
            </div>
            {topProduct && (
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-1.5 text-orange-500 text-xs font-medium mb-1">
                  <Pizza className="h-3.5 w-3.5" />
                  {topProduct.name}
                  <InfoTooltip text="Produto mais vendido do período, em % das unidades vendidas em relação ao total de itens vendidos no mesmo período." />
                </div>
                <p className="text-3xl font-bold text-foreground">{topProductPct}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">das vendas totais</p>
              </div>
            )}
            {peakHour && (
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-1.5 text-blue-500 text-xs font-medium mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  Pico de pedidos
                  <InfoTooltip text="Janela de 2 horas com o maior número de pedidos recebidos dentro do período selecionado." />
                </div>
                <p className="text-3xl font-bold text-foreground">{peakHour.hour}h às {peakHour.hour + 2}h</p>
                <p className="text-xs text-muted-foreground mt-0.5">horário de maior movimento</p>
              </div>
            )}
            {topPayment && (
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-1.5 text-purple-500 text-xs font-medium mb-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  {METHOD_LABELS[topPayment[0]] ?? topPayment[0]} representa
                  <InfoTooltip text="Forma de pagamento mais usada no período, em % do valor total pago em relação a todos os métodos de pagamento do período." />
                </div>
                <p className="text-3xl font-bold text-foreground">{topPaymentPct}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">dos pagamentos</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Produtos + Origem ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Produtos mais vendidos */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Produtos mais vendidos</h2>
            
          </div>
          {topProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
          ) : (
            <div className="space-y-4">
              {topProducts.slice(0, 5).map((p, i) => {
                const pct = Math.round((p.quantity / (topProducts[0]?.quantity || 1)) * 100)
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                        <span className="text-sm font-medium text-foreground">{p.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-foreground">{p.quantity} vendas</span>
                        <p className="text-[10px] text-muted-foreground">{formatCurrency(p.revenue)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Origem dos pedidos */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Origem dos pedidos</h2>
            
          </div>
          {salesByType.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
          ) : (
            <div className="space-y-4">
              {salesByType
                .sort((a, b) => b.count - a.count)
                .map((t) => {
                  const pct = Math.round((t.count / totalOrdersAll) * 100)
                  const color = TYPE_COLORS[t.type] ?? '#f97316'
                  return (
                    <div key={t.type}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{TYPE_LABELS[t.type] ?? t.type}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-foreground">{pct}%</span>
                          <span className="text-xs text-muted-foreground">{t.count} pedidos</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>

      {/* ── Formas de pagamento + Pico por horário ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Formas de pagamento */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Formas de pagamento</h2>
            
          </div>
          {paymentMerged.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
          ) : (
            <div className="space-y-4">
              {paymentMerged.map(([method, data]) => {
                const pct = Math.round((data.total / totalPaymentAll) * 100)
                const color = METHOD_COLORS[method] ?? '#f97316'
                return (
                  <div key={method}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{METHOD_LABELS[method] ?? method}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-foreground">{pct}%</span>
                        <span className="text-xs text-muted-foreground">{formatCurrency(data.total)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Pico por horário */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Pico de pedidos por horário</h2>
            
          </div>
          {salesByHour.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={salesByHour} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
                    tickFormatter={(h) => `${h}h`} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
                  <Tooltip
                    formatter={(v) => typeof v === 'number' ? [`${v} pedidos`, ''] : [v, '']}
                    labelFormatter={(h) => `${h}:00h`}
                  />
                  <Bar dataKey="orders" radius={[3, 3, 0, 0]}
                    fill="#f97316"
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-orange-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Horário mais movimentado</p>
                    <p className="text-sm font-bold text-foreground">
                      {peakHour ? `${peakHour.hour}h às ${peakHour.hour + 2}h` : '—'}
                    </p>
                    {peakHour && <p className="text-[10px] text-muted-foreground">{peakHour.orders} pedidos</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Média diária</p>
                  <p className="text-sm font-bold text-foreground">{avgOrders} pedidos</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Clientes ── */}
      {(summary.totalClients != null) && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Clientes</h2>
            
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Users className="h-4 w-4 text-orange-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{summary.newClients ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Novos clientes</p>
              {summary.totalClients > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {Math.round(((summary.newClients ?? 0) / summary.totalClients) * 100)}% do total
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{summary.returningClients ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Clientes recorrentes</p>
              {summary.totalClients > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {Math.round(((summary.returningClients ?? 0) / summary.totalClients) * 100)}% do total
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{(summary.returnRate ?? 0).toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">Taxa de retorno</p>
              <p className="text-[10px] text-muted-foreground">Clientes que voltaram</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Exportar ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-semibold text-foreground mb-1">Exportar relatórios</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Período: {startDate.split('-').reverse().join('/')} até {endDate.split('-').reverse().join('/')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          {([
            { type: 'orders',   format: 'xlsx', label: 'Pedidos Excel',   sub: 'Arquivo .xlsx', icon: FileSpreadsheet, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
            { type: 'orders',   format: 'pdf',  label: 'Pedidos PDF',     sub: 'Arquivo .pdf',  icon: FileText,        color: 'text-red-500',     bg: 'bg-red-100 dark:bg-red-900/30'         },
            { type: 'products', format: 'xlsx', label: 'Produtos Excel',  sub: 'Arquivo .xlsx', icon: FileSpreadsheet, color: 'text-teal-600',    bg: 'bg-teal-100 dark:bg-teal-900/30'       },
            { type: 'products', format: 'pdf',  label: 'Produtos PDF',    sub: 'Arquivo .pdf',  icon: FileText,        color: 'text-orange-500',  bg: 'bg-orange-100 dark:bg-orange-900/30'   },
          ] as const).map((exp) => {
            const key = `${exp.type}-${exp.format}`
            const isLoading = exporting === key
            const Icon = exp.icon
            return (
              <button
                key={key}
                onClick={() => exportFile(exp.format as 'xlsx' | 'pdf', exp.type, exp.label)}
                disabled={!!exporting}
                className="flex items-center gap-3 p-4 border border-border rounded-xl hover:bg-muted/50 disabled:opacity-60 transition-colors text-left"
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', exp.bg)}>
                  {isLoading
                    ? <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    : <Icon className={cn('h-5 w-5', exp.color)} />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{exp.label}</p>
                  <p className="text-[10px] text-muted-foreground">{exp.sub}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
