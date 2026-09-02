'use client'
// components/dashboard/manual-pix-settings-form.tsx
//
// Pix manual: o lojista cadastra a PRÓPRIA chave Pix (sem gateway). No
// cardápio digital e no PDV, isso gera um QR Code/copia-e-cola na hora —
// o cliente paga e manda o comprovante por WhatsApp, e o lojista confirma
// manualmente (ver app/api/orders/[id]/mark-paid).

import { useState, useTransition } from 'react'
import {
  Loader2, AlertCircle, CheckCircle2, QrCode, Trash2, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  togglePaymentOption,
  saveManualPixSettings,
  removeManualPixSettings,
  type ManualPixState,
} from '@/actions/settings/save-payment-settings'
import { useFormState, useFormStatus } from 'react-dom'

const KEY_TYPE_OPTIONS = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'PHONE', label: 'Telefone' },
  { value: 'RANDOM', label: 'Chave aleatória' },
] as const

interface ManualPixSettingsFormProps {
  manualPixEnabled: boolean
  hasKey: boolean
  keyType: string | null
  pixKey: string | null
  receiverName: string | null
  city: string | null
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors text-sm"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  )
}

export function ManualPixSettingsForm({
  manualPixEnabled, hasKey, keyType, pixKey, receiverName, city,
}: ManualPixSettingsFormProps) {
  const [enabled, setEnabled] = useState(manualPixEnabled)
  const [isTogglePending, startToggleTransition] = useTransition()
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(!hasKey)
  const [removing, setRemoving] = useState(false)

  const [state, formAction] = useFormState<ManualPixState, FormData>(
    async (prev, formData) => {
      const result = await saveManualPixSettings(prev, formData)
      if (result.success) setShowForm(false)
      return result
    },
    {}
  )

  function handleToggle() {
    if (!hasKey) {
      setToggleError('Cadastre a chave Pix antes de habilitar.')
      return
    }
    const next = !enabled
    setEnabled(next) // otimista
    setToggleError(null)
    startToggleTransition(async () => {
      const result = await togglePaymentOption('manualPixEnabled', next)
      if (result.error) {
        setEnabled(!next) // rollback
        setToggleError(result.error)
      }
    })
  }

  async function handleRemove() {
    if (!confirm('Remover a chave Pix manual cadastrada? A opção será desabilitada.')) return
    setRemoving(true)
    await removeManualPixSettings()
    setEnabled(false)
    setShowForm(true)
    setRemoving(false)
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm bg-emerald-600">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Pix manual</h3>
            <p className="text-xs text-muted-foreground">Sua própria chave Pix — sem gateway, confirmação manual</p>
          </div>
        </div>

        {/* Botão de habilitar — só funciona com chave já cadastrada */}
        <div className="flex items-center gap-2">
          {isTogglePending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            disabled={isTogglePending}
            className="relative disabled:opacity-60"
          >
            <div className={cn('w-11 h-6 rounded-full transition-colors', enabled ? 'bg-primary' : 'bg-muted')} />
            <div className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
              enabled && 'translate-x-5'
            )} />
          </button>
        </div>
      </div>

      {toggleError && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {toggleError}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Quando habilitado, aparece como forma de pagamento no cardápio digital e no PDV/balcão.
        O QR Code é gerado na hora com a sua chave — o cliente paga, manda o comprovante pelo
        WhatsApp do estabelecimento, e você confirma o pagamento manualmente no pedido.
      </p>

      {/* Chave já cadastrada — mostra resumo + opção de editar/remover */}
      {hasKey && !showForm && (
        <div className="space-y-2 pt-1 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs pt-3">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-foreground">
              {KEY_TYPE_OPTIONS.find((o) => o.value === keyType)?.label ?? keyType}: <span className="font-mono">{pixKey}</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Favorecido: {receiverName} — {city}
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center gap-1 text-xs font-medium text-destructive hover:underline disabled:opacity-50"
            >
              {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Remover
            </button>
          </div>
        </div>
      )}

      {/* Formulário de cadastro/edição da chave */}
      {showForm && (
        <form action={formAction} className="space-y-3 pt-1 border-t border-border">
          {state.error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive mt-3">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              {state.error}
            </div>
          )}
          {state.success && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-400 mt-3">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              Chave Pix salva!
            </div>
          )}

          <div className="grid gap-3 pt-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Tipo de chave</label>
              <select
                name="manualPixKeyType"
                defaultValue={keyType ?? 'CPF'}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {KEY_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Chave Pix</label>
              <input
                name="manualPixKey"
                defaultValue={pixKey ?? ''}
                placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória"
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Nome do favorecido <span className="font-normal text-muted-foreground">(máx. 25 caracteres, aparece no QR Code)</span>
              </label>
              <input
                name="manualPixReceiverName"
                defaultValue={receiverName ?? ''}
                maxLength={25}
                placeholder="Ex: Pizzaria do Zé"
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Cidade <span className="font-normal text-muted-foreground">(máx. 15 caracteres)</span>
              </label>
              <input
                name="manualPixCity"
                defaultValue={city ?? ''}
                maxLength={15}
                placeholder="Ex: Sao Paulo"
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SubmitButton label="Salvar chave Pix" />
            {hasKey && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
