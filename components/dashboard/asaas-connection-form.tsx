'use client'
// components/dashboard/asaas-connection-form.tsx
//
// Card de conexão do Asaas — diferente do Stripe/Mercado Pago, aqui não
// tem "Conectar conta" com redirect OAuth. O lojista gera a própria API
// Key no painel do Asaas (Integrações → Chaves de API) e cola aqui.

import { useEffect, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Loader2, AlertCircle, CheckCircle2, Trash2, ExternalLink } from 'lucide-react'
import { connectAsaas, disconnectAsaas, type AsaasConnectState } from '@/actions/settings/save-payment-settings'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors text-sm"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Conectar Asaas
    </button>
  )
}

export function AsaasConnectionCard() {
  const [status, setStatus] = useState<{ connected: boolean; accountId: string | null } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [state, formAction] = useFormState<AsaasConnectState, FormData>(connectAsaas, {})

  async function loadStatus() {
    try {
      const res = await fetch('/api/asaas/status').then((r) => r.json())
      setStatus(res)
    } catch {
      setStatus({ connected: false, accountId: null })
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  // Depois de conectar com sucesso, recarrega o status pra trocar o
  // formulário pela tela de "conectado".
  useEffect(() => {
    if (state.success) loadStatus()
  }, [state.success])

  async function handleDisconnect() {
    if (!confirm('Desconectar sua conta do Asaas? O Pix/cartão via Asaas param de funcionar até reconectar.')) return
    setRemoving(true)
    await disconnectAsaas()
    await loadStatus()
    setRemoving(false)
  }

  if (status === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm bg-[#00A868]">
          A
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Asaas</h3>
          <p className="text-xs text-muted-foreground">PIX e cartão no cardápio digital</p>
        </div>
      </div>

      {status.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Conectado{status.accountId ? ` (conta ${status.accountId})` : ''}
          </div>
          <button
            onClick={handleDisconnect}
            disabled={removing}
            className="flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline disabled:opacity-50"
          >
            {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Desconectar
          </button>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          {state.error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              {state.error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">API Key do Asaas</label>
            <input
              name="asaasApiKey"
              type="password"
              placeholder="$aact_prod_..."
              autoComplete="off"
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <a
            href="https://ajuda.asaas.com/pt-BR/articles/1996-como-faco-para-gerar-e-encontrar-a-api-key-do-meu-cliente-e-ou-conta"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" /> Onde encontro minha API Key no Asaas?
          </a>

          <SubmitButton />
        </form>
      )}
    </div>
  )
}
