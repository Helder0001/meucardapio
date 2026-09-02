'use client'
// components/dashboard/payment-settings-form.tsx
//
// Tela de pagamentos: conexão OAuth com o Mercado Pago (PIX/cartão dos
// clientes do restaurante) + webhook secret + toggle de PIX habilitado.

import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { savePaymentSettings, removePaymentCredentials, togglePaymentOption, setPaymentProvider, type ProviderChoice } from '@/actions/settings/save-payment-settings'
import { AsaasConnectionCard } from '@/components/dashboard/asaas-connection-form'
import {
  Loader2, Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink,
  Trash2, ShieldCheck, QrCode, Unplug, AlertTriangle, CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Toggle que salva IMEDIATAMENTE ao clicar (nada de precisar apertar um
// botão "Salvar" separado — isso confundia e fazia parecer que a troca não
// tinha efeito). Estado otimista na hora do clique, com rollback se falhar.
function PaymentToggle({
  field, label, description, initialValue,
}: { field: 'pixEnabled' | 'cardEnabled' | 'linkEnabled' | 'manualPixEnabled'; label: string; description: string; initialValue: boolean }) {
  const [checked, setChecked] = useState(initialValue)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = () => {
    const next = !checked
    setChecked(next)      // otimista
    setError(null)
    startTransition(async () => {
      const result = await togglePaymentOption(field, next)
      if (result.error) {
        setChecked(!next)   // rollback
        setError(result.error)
      }
    })
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <p className="font-medium text-foreground text-sm">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={handleToggle}
            disabled={isPending}
            className="relative disabled:opacity-60"
          >
            <div className={cn('w-11 h-6 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted')} />
            <div className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
              checked && 'translate-x-5'
            )} />
          </button>
        </div>
      </label>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? 'Salvando...' : 'Salvar configurações'}
    </button>
  )
}

interface MpStatus {
  connected: boolean
  mpUserId: string | null
  liveMode: boolean | null
  isTestKey: boolean | null
  connectedAt: string | null
  hasLegacyToken: boolean
}

interface StripeStatus {
  connected: boolean
  stripeUserId: string | null
  livemode: boolean | null
  connectedAt: string | null
}

interface EfiStatus {
  connected: boolean
  sandbox: boolean | null
  connectedAt: string | null
  pixEnabled: boolean
}

// Card de conexão do Stripe Connect — mesmo padrão visual do Mercado Pago
// acima, já que o Stripe também tem OAuth de verdade.
function StripeConnectionCard() {
  const [status, setStatus] = useState<StripeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()

  async function loadStatus() {
    try {
      const res = await fetch('/api/stripe/status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setError('Não foi possível carregar o status da conexão com o Stripe.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStatus() }, [])

  useEffect(() => {
    if (searchParams.get('error') === 'stripe') {
      setError('Não foi possível concluir a conexão com o Stripe. Tente novamente.')
    }
  }, [searchParams])

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/connect', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível iniciar a conexão.')
        return
      }
      window.location.href = data.authorizationUrl
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar sua conta do Stripe?')) return
    setDisconnecting(true)
    try {
      await fetch('/api/stripe/disconnect', { method: 'POST' })
      await loadStatus()
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm bg-[#635BFF]">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Stripe</h3>
            <p className="text-xs text-muted-foreground">Cartão internacional dos seus clientes</p>
          </div>
        </div>

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : status?.connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-emerald-600 bg-emerald-500/10">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Conectado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-muted-foreground bg-muted">
            Não conectado
          </span>
        )}
      </div>

      {!loading && status?.connected && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Modo:</span>
            {status.livemode ? (
              <span className="font-semibold text-emerald-600">✅ Produção — pagamentos reais</span>
            ) : (
              <span className="font-semibold text-amber-600">⚠️ Teste — pagamentos não são reais</span>
            )}
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border text-xs text-muted-foreground">
            <span>
              Conectado {status.connectedAt ? `em ${new Date(status.connectedAt).toLocaleDateString('pt-BR')}` : ''}
            </span>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
              Desconectar
            </button>
          </div>
        </div>
      )}

      {!loading && !status?.connected && (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors text-sm"
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Conectar conta do Stripe
        </button>
      )}
    </div>
  )
}

// Card de "cadastro" da Efí Bank. Diferente do MP/Stripe, a Efí não tem
// OAuth pra plataformas terceiras — o tenant precisa colar aqui o Client
// ID/Secret que ele mesmo gerou no painel da própria conta Efí dele.
function EfiConnectionCard() {
  const [status, setStatus] = useState<EfiStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [accountIdentifier, setAccountIdentifier] = useState('')
  const [sandbox, setSandbox] = useState(true)
  const [enablePix, setEnablePix] = useState(false)
  const [pixCertificateBase64, setPixCertificateBase64] = useState('')
  const [pixCertificateFileName, setPixCertificateFileName] = useState('')
  const [pixCertificatePassphrase, setPixCertificatePassphrase] = useState('')
  const [pixKey, setPixKey] = useState('')

  async function handleCertificateFile(e: { target: HTMLInputElement }) {
    const file = e.target.files?.[0]
    if (!file) return
    setPixCertificateFileName(file.name)
    const buffer = await file.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    setPixCertificateBase64(base64)
  }

  async function loadStatus() {
    try {
      const res = await fetch('/api/efi/status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setError('Não foi possível carregar o status da conexão com a Efí.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStatus() }, [])

  async function handleSave() {
    if (enablePix && (!pixCertificateBase64 || !pixKey)) {
      setError('Pra habilitar Pix, envie o certificado .p12 e a chave Pix.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/efi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientSecret,
          accountIdentifier,
          sandbox,
          ...(enablePix ? { pixCertificateBase64, pixCertificatePassphrase, pixKey } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível salvar as credenciais.')
        return
      }
      setClientId('')
      setClientSecret('')
      setAccountIdentifier('')
      setPixCertificateBase64('')
      setPixCertificateFileName('')
      setPixCertificatePassphrase('')
      setPixKey('')
      setShowForm(false)
      await loadStatus()
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Remover as credenciais da Efí cadastradas?')) return
    setDisconnecting(true)
    try {
      await fetch('/api/efi/disconnect', { method: 'POST' })
      await loadStatus()
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm bg-[#FF7A00]">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Efí Bank</h3>
            <p className="text-xs text-muted-foreground">PIX e cartão dos seus clientes</p>
          </div>
        </div>

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : status?.connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-emerald-600 bg-emerald-500/10">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Conectado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-muted-foreground bg-muted">
            Não conectado
          </span>
        )}
      </div>

      {!loading && status?.connected && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-1.5 text-xs">
            {status.pixEnabled ? (
              <span className="text-emerald-600 font-medium">✅ Pix habilitado (certificado configurado)</span>
            ) : (
              <span className="text-muted-foreground">Pix não habilitado — só cartão configurado por enquanto</span>
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground">
            <span>
              {status.sandbox ? '⚠️ Modo sandbox (teste)' : '✅ Modo produção'}
              {status.connectedAt ? ` — cadastrado em ${new Date(status.connectedAt).toLocaleDateString('pt-BR')}` : ''}
            </span>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
              Remover
            </button>
          </div>
        </div>
      )}

      {!loading && !status?.connected && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm"
        >
          Cadastrar credenciais da Efí
        </button>
      )}

      {!loading && !status?.connected && showForm && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground">
            A Efí não oferece conexão automática — abra sua conta em{' '}
            <a href="https://sejaefi.com.br" target="_blank" rel="noreferrer" className="underline">sejaefi.com.br</a>,
            crie uma aplicação com a API Cobranças ativada, e cole as credenciais dela aqui.
          </p>
          <div className="grid gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Client ID</label>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Client Secret</label>
              <input
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                type="password"
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Identificador da conta (JS de tokenização de cartão){' '}
                <span className="font-normal text-muted-foreground">— opcional por enquanto</span>
              </label>
              <input
                value={accountIdentifier}
                onChange={(e) => setAccountIdentifier(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                autoComplete="off"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
              Usar ambiente sandbox (teste)
            </label>

            <div className="border-t border-border pt-3 space-y-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer font-medium text-foreground">
                <input type="checkbox" checked={enablePix} onChange={(e) => setEnablePix(e.target.checked)} />
                Habilitar Pix via Efí
              </label>

              {enablePix && (
                <div className="space-y-3 pl-1">
                  <p className="text-xs text-muted-foreground">
                    A API de Pix da Efí exige um certificado próprio (.p12), diferente do cartão.
                    Gere um em sua conta Efí em API → Meus Certificados.
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Certificado .p12</label>
                    <input
                      type="file"
                      accept=".p12,.pfx"
                      onChange={handleCertificateFile}
                      className="w-full text-sm text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-muted file:text-foreground file:text-xs"
                    />
                    {pixCertificateFileName && (
                      <p className="text-xs text-emerald-600 mt-1">✓ {pixCertificateFileName}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Senha do certificado{' '}
                      <span className="font-normal text-muted-foreground">— deixe em branco se não tiver</span>
                    </label>
                    <input
                      value={pixCertificatePassphrase}
                      onChange={(e) => setPixCertificatePassphrase(e.target.value)}
                      type="password"
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Chave Pix cadastrada na Efí</label>
                    <input
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                      placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória"
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      autoComplete="off"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !clientId || !clientSecret || (enablePix && (!pixCertificateBase64 || !pixKey))}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors text-sm"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Validar e salvar
            </button>
            <button
              onClick={() => setShowForm(false)}
              disabled={saving}
              className="px-4 py-2.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface PaymentSettingsFormProps {
  hasSecret: boolean
  pixEnabled: boolean
  cardEnabled: boolean
  linkEnabled: boolean
}


// Seletor de qual provedor conectado processa Pix e Cartão. Só oferece
// como opção o que está realmente conectado — evita escolher algo que
// nunca vai funcionar.
function ProviderSelector() {
  const [mpConnected, setMpConnected] = useState(false)
  const [stripeConnected, setStripeConnected] = useState(false)
  const [efiCardConnected, setEfiCardConnected] = useState(false)
  const [efiPixConnected, setEfiPixConnected] = useState(false)
  const [asaasConnected, setAsaasConnected] = useState(false)
  const [pixProvider, setPixProviderState] = useState<ProviderChoice>('MERCADOPAGO')
  const [cardProvider, setCardProviderState] = useState<ProviderChoice>('MERCADOPAGO')
  const [loading, setLoading] = useState(true)
  const [savingMethod, setSavingMethod] = useState<'pix' | 'card' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [mpRes, stripeRes, efiRes, asaasRes, tenantRes] = await Promise.all([
          fetch('/api/mercadopago/status').then((r) => r.json()).catch(() => ({ connected: false })),
          fetch('/api/stripe/status').then((r) => r.json()).catch(() => ({ connected: false })),
          fetch('/api/efi/status').then((r) => r.json()).catch(() => ({ connected: false, pixEnabled: false })),
          fetch('/api/asaas/status').then((r) => r.json()).catch(() => ({ connected: false })),
          fetch('/api/settings/payment-providers').then((r) => r.json()).catch(() => ({})),
        ])
        setMpConnected(!!mpRes.connected)
        setStripeConnected(!!stripeRes.connected)
        setEfiCardConnected(!!efiRes.connected)
        setEfiPixConnected(!!efiRes.connected && !!efiRes.pixEnabled)
        setAsaasConnected(!!asaasRes.connected)
        if (tenantRes.pix) setPixProviderState(tenantRes.pix)
        if (tenantRes.card) setCardProviderState(tenantRes.card)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleChange(method: 'pix' | 'card', provider: ProviderChoice) {
    setSavingMethod(method)
    setError(null)
    const result = await setPaymentProvider(method, provider)
    if (result.error) {
      setError(result.error)
    } else if (method === 'pix') {
      setPixProviderState(provider)
    } else {
      setCardProviderState(provider)
    }
    setSavingMethod(null)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando provedores...
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-foreground">Qual provedor usar</h3>
        <p className="text-xs text-muted-foreground">Escolha qual conta processa cada forma de pagamento</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">PIX</label>
          <select
            value={pixProvider}
            onChange={(e) => handleChange('pix', e.target.value as ProviderChoice)}
            disabled={savingMethod === 'pix'}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            <option value="MERCADOPAGO" disabled={!mpConnected}>Mercado Pago{!mpConnected ? ' (não conectado)' : ''}</option>
            <option value="EFI" disabled={!efiPixConnected}>Efí Bank{!efiPixConnected ? ' (Pix não habilitado)' : ''}</option>
            <option value="ASAAS" disabled={!asaasConnected}>Asaas{!asaasConnected ? ' (não conectado)' : ''}</option>
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">Stripe ainda não tem Pix inline neste checkout.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Cartão</label>
          <select
            value={cardProvider}
            onChange={(e) => handleChange('card', e.target.value as ProviderChoice)}
            disabled={savingMethod === 'card'}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            <option value="MERCADOPAGO" disabled={!mpConnected}>Mercado Pago{!mpConnected ? ' (não conectado)' : ''}</option>
            <option value="STRIPE" disabled={!stripeConnected}>Stripe{!stripeConnected ? ' (não conectado)' : ''}</option>
            <option value="EFI" disabled={!efiCardConnected}>Efí Bank{!efiCardConnected ? ' (não conectado)' : ''}</option>
            <option value="ASAAS" disabled={!asaasConnected}>Asaas{!asaasConnected ? ' (não conectado)' : ''}</option>
          </select>
        </div>
      </div>
    </div>
  )
}

export function PaymentSettingsForm({ hasSecret, pixEnabled, cardEnabled, linkEnabled }: PaymentSettingsFormProps) {
  const [state, formAction] = useFormState(savePaymentSettings, {})
  const [showSecret, setShowSecret] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [mpStatus, setMpStatus] = useState<MpStatus | null>(null)
  const [mpLoading, setMpLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [mpError, setMpError] = useState<string | null>(null)

  const searchParams = useSearchParams()

  async function loadMpStatus() {
    try {
      const res = await fetch('/api/mercadopago/status')
      const data = await res.json()
      setMpStatus(data)
    } catch {
      setMpError('Não foi possível carregar o status da conexão com o Mercado Pago.')
    } finally {
      setMpLoading(false)
    }
  }

  useEffect(() => {
    loadMpStatus()
  }, [])

  useEffect(() => {
    if (searchParams.get('error') === 'mercadopago') {
      setMpError('Não foi possível concluir a conexão com o Mercado Pago. Tente novamente.')
    }
  }, [searchParams])

  async function handleConnect() {
    setConnecting(true)
    setMpError(null)
    try {
      const res = await fetch('/api/mercadopago/connect', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMpError(data.error ?? 'Não foi possível iniciar a conexão.')
        return
      }
      window.location.href = data.authorizationUrl
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar sua conta do Mercado Pago? O PIX vai parar de funcionar até reconectar.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/mercadopago/disconnect', { method: 'POST' })
      await loadMpStatus()
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleRemoveLegacy() {
    if (!confirm('Remover o token antigo configurado manualmente?')) return
    setIsRemoving(true)
    await removePaymentCredentials()
    setIsRemoving(false)
    await loadMpStatus()
  }

  return (
    <div className="space-y-6">
      {mpError && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {mpError}
        </div>
      )}

      {/* Conexão com o Mercado Pago (OAuth) */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm bg-[#009EE3]">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Mercado Pago</h3>
              <p className="text-xs text-muted-foreground">PIX e cartão dos seus clientes</p>
            </div>
          </div>

          {mpLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : mpStatus?.connected ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-emerald-600 bg-emerald-500/10">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full text-muted-foreground bg-muted">
              Não conectado
            </span>
          )}
        </div>

        {!mpLoading && mpStatus?.connected && (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              Pagamentos dos seus clientes vão direto para a sua conta do Mercado Pago.
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Modo:</span>
              {mpStatus.liveMode === false || mpStatus.isTestKey === true ? (
                <span className="font-semibold text-amber-600">⚠️ Teste (sandbox) — pagamentos não são reais</span>
              ) : mpStatus.liveMode === true || mpStatus.isTestKey === false ? (
                <span className="font-semibold text-emerald-600">✅ Produção — pagamentos reais</span>
              ) : (
                <span className="font-semibold text-muted-foreground">Não foi possível determinar</span>
              )}
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-border text-xs text-muted-foreground">
              <span>
                Conectado {mpStatus.connectedAt ? `em ${new Date(mpStatus.connectedAt).toLocaleDateString('pt-BR')}` : ''}
              </span>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
              >
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                Desconectar
              </button>
            </div>
          </div>
        )}

        {!mpLoading && !mpStatus?.connected && (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors text-sm"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Conectar conta do Mercado Pago
          </button>
        )}

        {!mpLoading && mpStatus?.hasLegacyToken && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div className="space-y-1.5">
              <p>
                Você ainda tem um Access Token antigo configurado manualmente.
                {mpStatus.connected
                  ? ' A conexão acima (mais segura) está sendo usada como prioridade.'
                  : ' Ele está sendo usado até você conectar via Mercado Pago acima.'}
              </p>
              <button
                onClick={handleRemoveLegacy}
                disabled={isRemoving}
                className="flex items-center gap-1 font-medium hover:underline disabled:opacity-50"
              >
                {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Remover token antigo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Outras formas de receber — conexão apenas por enquanto. O
          roteamento de qual provedor processa cada PIX/cartão/link ainda
          não está ligado a essas conexões; fica pra uma etapa seguinte. */}
      <div className="pt-1">
        <h2 className="text-sm font-semibold text-foreground mb-3">Outras formas de receber</h2>
        <div className="space-y-4">
          <StripeConnectionCard />
          <EfiConnectionCard />
          <AsaasConnectionCard />
        </div>
      </div>

      {/* Qual provedor processa cada método */}
      <ProviderSelector />

      {/* Toggles — salvam na hora, independentes do formulário abaixo */}
      <PaymentToggle
        field="pixEnabled"
        label="Habilitar pagamento via PIX"
        description="Exibe a opção PIX no checkout para seus clientes"
        initialValue={pixEnabled}
      />
      <PaymentToggle
        field="cardEnabled"
        label="Habilitar cartão online"
        description="Exibe a opção de cartão no checkout do cardápio digital e no link de pagamento do PDV"
        initialValue={cardEnabled}
      />
      <PaymentToggle
        field="linkEnabled"
        label="Habilitar link de pagamento (Mercado Pago)"
        description="Exibe a opção 'Link de pagamento' apenas no PDV/balcão — o cliente escolhe Pix ou cartão na própria página do Mercado Pago. Não aparece mais no cardápio digital."
        initialValue={linkEnabled}
      />

      {/* Webhook secret */}
      <form action={formAction} className="space-y-5">
        {state.error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {state.error}
          </div>
        )}
        {state.success && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            Configurações salvas!
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Webhook Secret{' '}
              <span className="text-xs font-normal text-muted-foreground">(recomendado)</span>
            </label>
            <div className="relative">
              <input
                name="mercadoPagoWebhookSecret"
                type={showSecret ? 'text' : 'password'}
                placeholder={hasSecret ? '••••••••••••••••• (já configurado)' : 'Chave secreta do webhook'}
                className="w-full px-3 py-2.5 pr-10 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Gerada ao cadastrar o webhook no painel do MP. Protege contra notificações falsas.
            </p>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            Configure o Webhook no painel do MP
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-500">
            Para confirmação automática dos pagamentos, cadastre esta URL em{' '}
            <strong>Mercado Pago → Webhooks</strong>:
          </p>
          <code className="block text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300 px-3 py-2 rounded-lg break-all">
            {process.env.NEXT_PUBLIC_APP_URL ?? 'https://meucardapio-teal.vercel.app'}/api/webhooks/mercadopago
          </code>
          <p className="text-xs text-amber-700 dark:text-amber-500">
            Evento: <strong>Pagamentos</strong>
          </p>
        </div>

        <SubmitButton />
      </form>
    </div>
  )
}
