'use client'
// components/dashboard/marketplace-integrations.tsx
//
// Tela de gerenciamento das integrações com iFood e 99Food.
// O lojista nunca vê client_id/client_secret — só clica em "Conectar",
// autoriza na plataforma de origem (iFood) ou segue instruções de
// liberação manual (99Food), e volta aqui já conectado.

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, CheckCircle2, AlertCircle, XCircle, RefreshCw,
  ExternalLink, Unplug, Settings2, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Provider = 'ifood' | '99food'

interface ConnectionDTO {
  id: string
  provider: 'IFOOD' | 'NINETYNINE_FOOD'
  status: 'PENDING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  merchantName: string | null
  externalMerchantId: string | null
  autoAcceptOrders: boolean
  isOpen: boolean
  lastPolledAt: string | null
  lastPollingError: string | null
  connectedAt: string | null
  _count: { orders: number }
}

interface PendingOrderDTO {
  id: string
  provider: 'IFOOD' | 'NINETYNINE_FOOD'
  externalOrderId: string
  externalDisplayId: string | null
  grossAmount: string | null
  receivedAt: string
}

const PROVIDER_META: Record<Provider, { label: string; enumValue: ConnectionDTO['provider']; color: string }> = {
  ifood: { label: 'iFood', enumValue: 'IFOOD', color: '#EA1D2C' },
  '99food': { label: '99Food', enumValue: 'NINETYNINE_FOOD', color: '#FFD400' },
}

function StatusBadge({ status }: { status: ConnectionDTO['status'] | 'NOT_CONNECTED' }) {
  const map = {
    CONNECTED: { icon: CheckCircle2, text: 'Conectado', cls: 'text-emerald-600 bg-emerald-500/10' },
    PENDING: { icon: Clock, text: 'Aguardando autorização', cls: 'text-amber-600 bg-amber-500/10' },
    ERROR: { icon: AlertCircle, text: 'Erro — reconecte', cls: 'text-destructive bg-destructive/10' },
    DISCONNECTED: { icon: XCircle, text: 'Desconectado', cls: 'text-muted-foreground bg-muted' },
    NOT_CONNECTED: { icon: XCircle, text: 'Não conectado', cls: 'text-muted-foreground bg-muted' },
  } as const
  const { icon: Icon, text, cls } = map[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', cls)}>
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}

export function MarketplaceIntegrations() {
  const [connections, setConnections] = useState<ConnectionDTO[]>([])
  const [pendingOrders, setPendingOrders] = useState<PendingOrderDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [manualShopId, setManualShopId] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [connRes, pendingRes] = await Promise.all([
        fetch('/api/marketplace/connections'),
        fetch('/api/marketplace/pending-orders'),
      ])
      const connData = await connRes.json()
      const pendingData = await pendingRes.json()
      setConnections(connData.connections ?? [])
      setPendingOrders(pendingData.pending ?? [])
    } catch {
      setError('Não foi possível carregar as integrações.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Atualiza pedidos pendentes a cada 20s (sem esperar o usuário recarregar a página —
    // pedidos pendentes têm prazo curto para confirmação na plataforma de origem)
    const interval = setInterval(load, 20_000)
    return () => clearInterval(interval)
  }, [load])

  function getConnection(provider: Provider) {
    return connections.find((c) => c.provider === PROVIDER_META[provider].enumValue)
  }

  async function handleConnect(provider: Provider) {
    setActionLoading(provider)
    setError(null)
    try {
      const res = await fetch(`/api/marketplace/${provider}/connect`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível iniciar a conexão.')
        return
      }
      if (data.mode === 'redirect' && data.authorizationUrl) {
        window.location.href = data.authorizationUrl
        return
      }
      // mode === 'manual' (99Food) — instruções já exibidas no card
      await load()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleManualComplete(provider: Provider) {
    const appShopId = manualShopId[provider]?.trim()
    if (!appShopId) return
    setActionLoading(provider)
    setError(null)
    try {
      const res = await fetch(`/api/marketplace/${provider}/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appShopId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'AppShopID inválido.')
        return
      }
      await load()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDisconnect(provider: Provider) {
    if (!confirm('Desconectar esta loja? Pedidos pararão de cair automaticamente no sistema.')) return
    setActionLoading(provider)
    try {
      await fetch(`/api/marketplace/${provider}/disconnect`, { method: 'POST' })
      await load()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleSyncNow(provider: Provider) {
    setActionLoading(`sync-${provider}`)
    try {
      await fetch(`/api/marketplace/${provider}/sync-now`, { method: 'POST' })
      await load()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleToggleSetting(provider: Provider, key: 'autoAcceptOrders' | 'isOpen', value: boolean) {
    await fetch(`/api/marketplace/${provider}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
    await load()
  }

  async function handleConfirmOrder(id: string) {
    setActionLoading(`order-${id}`)
    try {
      const res = await fetch(`/api/marketplace/pending-orders/${id}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Falha ao confirmar pedido.')
      await load()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRejectOrder(id: string) {
    if (!confirm('Recusar este pedido? O cliente será avisado pela plataforma de origem.')) return
    setActionLoading(`order-${id}`)
    try {
      await fetch(`/api/marketplace/pending-orders/${id}/reject`, { method: 'POST' })
      await load()
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando integrações...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Pedidos aguardando confirmação manual */}
      {pendingOrders.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            Pedidos aguardando confirmação ({pendingOrders.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Confirme ou recuse dentro do prazo da plataforma de origem (no iFood, até 8 minutos após o recebimento).
          </p>
          <div className="space-y-2">
            {pendingOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {order.provider === 'IFOOD' ? 'iFood' : '99Food'} · #{order.externalDisplayId ?? order.externalOrderId.slice(-6)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.grossAmount ? `R$ ${Number(order.grossAmount).toFixed(2)}` : ''} · recebido {new Date(order.receivedAt).toLocaleTimeString('pt-BR')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRejectOrder(order.id)}
                    disabled={actionLoading === `order-${order.id}`}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    Recusar
                  </button>
                  <button
                    onClick={() => handleConfirmOrder(order.id)}
                    disabled={actionLoading === `order-${order.id}`}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {actionLoading === `order-${order.id}` && <Loader2 className="h-3 w-3 animate-spin" />}
                    Confirmar pedido
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cards de cada marketplace */}
      {(['ifood', '99food'] as Provider[]).map((provider) => {
        const meta = PROVIDER_META[provider]
        const connection = getConnection(provider)
        const status = connection?.status ?? 'NOT_CONNECTED'
        const isConnected = status === 'CONNECTED'
        const isPending = status === 'PENDING'

        return (
          <div key={provider} className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: meta.color }}
                >
                  {meta.label[0]}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{meta.label}</h3>
                  {connection?.merchantName && (
                    <p className="text-xs text-muted-foreground">{connection.merchantName}</p>
                  )}
                </div>
              </div>
              <StatusBadge status={status} />
            </div>

            {connection?.lastPollingError && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                {connection.lastPollingError}
              </div>
            )}

            {/* Não conectado */}
            {!connection && (
              <button
                onClick={() => handleConnect(provider)}
                disabled={actionLoading === provider}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors text-sm"
              >
                {actionLoading === provider ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Conectar {meta.label}
              </button>
            )}

            {/* Pendente: instruções (manual para 99Food, ou aguardando redirect do iFood) */}
            {isPending && (
              <div className="space-y-3">
                {provider === '99food' ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Solicite à 99Food (ou ao seu gerente de contas) a liberação do slot de integração Open Delivery
                      para esta loja. Depois que o lojista autorizar dentro do 99Food Admin, cole abaixo o <strong>AppShopID</strong> fornecido para concluir a conexão.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="AppShopID da loja"
                        value={manualShopId[provider] ?? ''}
                        onChange={(e) => setManualShopId((s) => ({ ...s, [provider]: e.target.value }))}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-input bg-background"
                      />
                      <button
                        onClick={() => handleManualComplete(provider)}
                        disabled={actionLoading === provider || !manualShopId[provider]?.trim()}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        Concluir
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Aguardando você concluir a autorização na janela do iFood...
                  </p>
                )}
              </div>
            )}

            {/* Conectado: configurações operacionais */}
            {isConnected && connection && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">Aceitar pedidos automaticamente</p>
                    <p className="text-xs text-muted-foreground">Se desligado, você confirma cada pedido manualmente aqui</p>
                  </div>
                  <Toggle
                    checked={connection.autoAcceptOrders}
                    onChange={(v) => handleToggleSetting(provider, 'autoAcceptOrders', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">Loja aberta para pedidos</p>
                    <p className="text-xs text-muted-foreground">Pausar não desconecta — só impede novos pedidos</p>
                  </div>
                  <Toggle
                    checked={connection.isOpen}
                    onChange={(v) => handleToggleSetting(provider, 'isOpen', v)}
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border text-xs text-muted-foreground">
                  <span>
                    {connection._count.orders} pedido(s) recebidos
                    {connection.lastPolledAt && ` · última verificação ${new Date(connection.lastPolledAt).toLocaleTimeString('pt-BR')}`}
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleSyncNow(provider)}
                      disabled={actionLoading === `sync-${provider}`}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', actionLoading === `sync-${provider}` && 'animate-spin')} />
                      Atualizar agora
                    </button>
                    <button
                      onClick={() => handleDisconnect(provider)}
                      disabled={actionLoading === provider}
                      className="flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors"
                    >
                      <Unplug className="h-3.5 w-3.5" />
                      Desconectar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {status === 'ERROR' && (
              <button
                onClick={() => handleConnect(provider)}
                disabled={actionLoading === provider}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <Settings2 className="h-4 w-4" />
                Reconectar
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
