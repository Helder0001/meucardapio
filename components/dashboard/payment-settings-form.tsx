'use client'
// components/dashboard/payment-settings-form.tsx

import { useFormState, useFormStatus } from 'react-dom'
import { savePaymentSettings, removePaymentCredentials } from '@/actions/settings/save-payment-settings'
import { Loader2, Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink, Trash2, ShieldCheck, QrCode } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

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

interface PaymentSettingsFormProps {
  hasToken: boolean      // se já tem Access Token configurado (não expomos o valor)
  hasSecret: boolean     // se já tem Webhook Secret configurado
  pixEnabled: boolean
}

export function PaymentSettingsForm({ hasToken, hasSecret, pixEnabled }: PaymentSettingsFormProps) {
  const [state, formAction] = useFormState(savePaymentSettings, {})
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  async function handleRemove() {
    if (!confirm('Tem certeza? O PIX vai parar de funcionar para seus clientes.')) return
    setIsRemoving(true)
    await removePaymentCredentials()
    setIsRemoving(false)
  }

  return (
    <div className="space-y-6">
      {/* Status atual */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <QrCode className="h-4 w-4 text-muted-foreground" />
          Status da integração PIX
        </h2>

        <div className="flex flex-col gap-2">
          <StatusRow
            label="Access Token"
            ok={hasToken}
            okText="Configurado"
            failText="Não configurado"
          />
          <StatusRow
            label="Webhook Secret"
            ok={hasSecret}
            okText="Configurado"
            failText="Não configurado (opcional)"
            optional
          />
          <StatusRow
            label="PIX habilitado"
            ok={pixEnabled}
            okText="Ativo"
            failText="Inativo"
          />
        </div>

        {hasToken && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              ✅ Seus clientes já podem pagar via PIX. O QR Code é gerado automaticamente ao fazer pedido.
            </p>
          </div>
        )}
      </div>

      {/* Formulário */}
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
            Configurações salvas! {state.tokenValid ? 'Token validado com sucesso.' : ''}
          </div>
        )}

        {/* Access Token */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">Credenciais do Mercado Pago</h3>
            <p className="text-xs text-muted-foreground mt-1">
              As cobranças PIX dos seus clientes vão direto para sua conta do Mercado Pago.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Access Token (Produção)
            </label>
            <div className="relative">
              <input
                name="mercadoPagoAccessToken"
                type={showToken ? 'text' : 'password'}
                placeholder={hasToken ? '••••••••••••••••••••••••• (já configurado)' : 'APP_USR-0000000000000000-000000-...'}
                className="w-full px-3 py-2.5 pr-10 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Encontre em{' '}
              <a
                href="https://www.mercadopago.com.br/developers/panel/app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                Mercado Pago → Credenciais de produção
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          {/* Webhook Secret — opcional mas recomendado */}
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

        {/* PIX habilitado */}
        <div className="bg-card border border-border rounded-xl p-5">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-foreground text-sm">Habilitar pagamento via PIX</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Exibe a opção PIX no checkout para seus clientes
              </p>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                name="pixEnabled"
                value="true"
                defaultChecked={pixEnabled}
                className="sr-only peer"
                onChange={(e) => {
                  const hiddenInput = document.querySelector<HTMLInputElement>('input[name="pixEnabled"][type="hidden"]')
                  if (hiddenInput) hiddenInput.value = e.target.checked ? 'true' : 'false'
                }}
              />
              {/* Toggle visual */}
              <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
            </div>
          </label>
          {/* hidden para garantir valor false quando desmarcado */}
          <input type="hidden" name="pixEnabled" value="false" />
        </div>

        {/* Instrução webhook */}
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

        <div className="flex items-center justify-between">
          <SubmitButton />

          {hasToken && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving}
              className="flex items-center gap-1.5 text-sm text-destructive hover:text-destructive/80 disabled:opacity-60"
            >
              {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remover credenciais
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

function StatusRow({
  label,
  ok,
  okText,
  failText,
  optional,
}: {
  label: string
  ok: boolean
  okText: string
  failText: string
  optional?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'flex items-center gap-1 font-medium',
          ok
            ? 'text-emerald-600 dark:text-emerald-400'
            : optional
            ? 'text-muted-foreground'
            : 'text-amber-600 dark:text-amber-400'
        )}
      >
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5" />
        )}
        {ok ? okText : failText}
      </span>
    </div>
  )
}
