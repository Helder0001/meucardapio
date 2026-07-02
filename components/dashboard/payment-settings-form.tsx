'use client'
// components/dashboard/payment-settings-form.tsx
//
// Tela de pagamentos: conexão OAuth com o Mercado Pago (PIX/cartão dos
// clientes do restaurante) + webhook secret + toggle de PIX habilitado.

import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { savePaymentSettings, removePaymentCredentials, togglePaymentOption } from '@/actions/settings/save-payment-settings'
import {
  Loader2, Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink,
  Trash2, ShieldCheck, QrCode, Unplug, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Toggle que salva IMEDIATAMENTE ao clicar (nada de precisar apertar um
// botão "Salvar" separado — isso confundia e fazia parecer que a troca não
// tinha efeito). Estado otimista na hora do clique, com rollback se falhar.
function PaymentToggle({
  field, label, description, initialValue,
}: { field: 'pixEnabled' | 'cardEnabled'; label: string; description: string; initialValue: boolean }) {
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
  connectedAt: string | null
  hasLegacyToken: boolean
}

interface PaymentSettingsFormProps {
  hasSecret: boolean
  pixEnabled: boolean
  cardEnabled: boolean
}

export function PaymentSettingsForm({ hasSecret, pixEnabled, cardEnabled }: PaymentSettingsFormProps) {
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
              {mpStatus.liveMode === false && (
                <span className="block mt-1 text-amber-600 font-medium">
                  ⚠️ Conectado em modo de teste (sandbox) — pagamentos não são reais.
                </span>
              )}
            </p>
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
