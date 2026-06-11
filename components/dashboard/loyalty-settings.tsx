'use client'

// components/dashboard/loyalty-settings.tsx

import { useFormState, useFormStatus } from 'react-dom'
import { saveLoyaltyAction } from '@/actions/loyalty/save-loyalty'
import { Loader2, Star, Percent } from 'lucide-react'

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {label}
    </button>
  )
}

interface LoyaltySettingsProps {
  loyalty:  { pointsPerReal: number; redeemEvery: number; redeemValue: number; isActive: boolean } | null
  cashback: { percentage: number; validityDays: number; isActive: boolean } | null
}

export function LoyaltySettings({ loyalty, cashback }: LoyaltySettingsProps) {
  const [loyaltyState, loyaltyAction] = useFormState(saveLoyaltyAction, {})

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Fidelidade */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-4 w-4 text-amber-500" />
          <h2 className="font-semibold text-foreground">Programa de Pontos</h2>
        </div>

        {loyaltyState.success && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            ✓ Configurações salvas!
          </div>
        )}
        {loyaltyState.error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {loyaltyState.error}
          </div>
        )}

        <form action={loyaltyAction} className="space-y-4">
          <input type="hidden" name="module" value="loyalty" />

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Pontos por R$ 1 gasto
            </label>
            <input name="pointsPerReal" type="number" step="0.1" min="0.1"
              defaultValue={loyalty?.pointsPerReal ?? 1}
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Ex: 1 = cliente ganha 1 ponto por cada R$ 1 gasto
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Pontos para resgatar
              </label>
              <input name="redeemEvery" type="number" min="1"
                defaultValue={loyalty?.redeemEvery ?? 100}
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Vale R$
              </label>
              <input name="redeemValue" type="number" step="0.01" min="0.01"
                defaultValue={loyalty?.redeemValue ?? 5}
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {loyalty && (
            <p className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
              💡 A cada {loyalty.redeemEvery} pontos, o cliente ganha R$ {loyalty.redeemValue.toFixed(2)} de desconto
            </p>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" name="isActive" id="loyalty-active"
              defaultChecked={loyalty?.isActive ?? true}
              className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
            />
            <label htmlFor="loyalty-active" className="text-sm text-foreground cursor-pointer">
              Programa de pontos ativo
            </label>
          </div>

          <SubmitBtn label="Salvar pontos" />
        </form>
      </div>

      {/* Cashback */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Percent className="h-4 w-4 text-emerald-500" />
          <h2 className="font-semibold text-foreground">Cashback</h2>
        </div>

        <form action={loyaltyAction} className="space-y-4">
          <input type="hidden" name="module" value="cashback" />

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Porcentagem de cashback (%)
            </label>
            <input name="percentage" type="number" step="0.5" min="0" max="50"
              defaultValue={cashback?.percentage ?? 5}
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Ex: 5 = cliente recebe 5% do valor do pedido como crédito
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Validade do cashback (dias)
            </label>
            <input name="validityDays" type="number" min="1"
              defaultValue={cashback?.validityDays ?? 30}
              className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" name="isActive" id="cashback-active"
              defaultChecked={cashback?.isActive ?? true}
              className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
            />
            <label htmlFor="cashback-active" className="text-sm text-foreground cursor-pointer">
              Cashback ativo
            </label>
          </div>

          <SubmitBtn label="Salvar cashback" />
        </form>
      </div>
    </div>
  )
}
