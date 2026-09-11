'use client'
// components/dashboard/finance-rates-form.tsx
//
// Configuração de taxas e prazos usados pelo Fluxo de Recebimentos quando
// o provedor não devolve isso sozinho: Efí (PIX e cartão) e maquininha
// física (cartão manual). Mercado Pago e Asaas NÃO aparecem aqui — eles já
// mandam o valor líquido e a data reais na própria API.

import { Loader2, Info } from 'lucide-react'
import { saveFinanceRates, type FinanceRatesState } from '@/actions/settings/save-finance-rates'
import { useFormState, useFormStatus } from 'react-dom'

export interface FinanceRatesFormProps {
  efiPixRate?: number;            efiPixDays?: number
  efiCard1xRate?: number;         efiCard1xDays?: number
  efiCard2to6Rate?: number;       efiCard2to6Days?: number
  efiCard7to12Rate?: number;      efiCard7to12Days?: number
  maquininhaCreditoRate?: number; maquininhaCreditoDays?: number
  maquininhaDebitoRate?: number;  maquininhaDebitoDays?: number
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors text-sm"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Salvar taxas
    </button>
  )
}

function RateRow({ label, rateField, daysField, defaultRate, defaultDays }: {
  label: string; rateField: string; daysField: string
  defaultRate?: number; defaultDays?: number
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-3 items-end">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      </div>
      <div>
        <label className="block text-[10px] text-muted-foreground mb-1">Taxa (%)</label>
        <input
          type="number" step="0.01" min="0" max="100" name={rateField}
          defaultValue={defaultRate ?? ''}
          placeholder="ex: 3,49"
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm"
        />
      </div>
      <div>
        <label className="block text-[10px] text-muted-foreground mb-1">Prazo (dias)</label>
        <input
          type="number" step="1" min="0" max="90" name={daysField}
          defaultValue={defaultDays ?? ''}
          placeholder="ex: 31"
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm"
        />
      </div>
    </div>
  )
}

export function FinanceRatesForm(props: FinanceRatesFormProps) {
  const [state, formAction] = useFormState<FinanceRatesState, FormData>(saveFinanceRates, {})

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
      <div>
        <h2 className="font-semibold text-foreground">Taxas e prazos</h2>
        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          Mercado Pago e Asaas já mandam o valor líquido e a data de recebimento reais automaticamente —
          não precisam ser configurados aqui. Preencha só o que você usa: Efí (a API dela não informa taxa)
          e/ou maquininha física (que não se comunica com o sistema).
        </p>
      </div>

      <form action={formAction} className="space-y-5">
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Efí — Pix</h3>
          <RateRow label="Pix via API (Cob/CobV)" rateField="efiPixRate" daysField="efiPixDays"
            defaultRate={props.efiPixRate} defaultDays={props.efiPixDays} />
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Efí — Cartão online</h3>
          <RateRow label="À vista (1x)" rateField="efiCard1xRate" daysField="efiCard1xDays"
            defaultRate={props.efiCard1xRate} defaultDays={props.efiCard1xDays} />
          <RateRow label="Parcelado 2x a 6x" rateField="efiCard2to6Rate" daysField="efiCard2to6Days"
            defaultRate={props.efiCard2to6Rate} defaultDays={props.efiCard2to6Days} />
          <RateRow label="Parcelado 7x a 12x" rateField="efiCard7to12Rate" daysField="efiCard7to12Days"
            defaultRate={props.efiCard7to12Rate} defaultDays={props.efiCard7to12Days} />
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Maquininha física</h3>
          <RateRow label="Crédito" rateField="maquininhaCreditoRate" daysField="maquininhaCreditoDays"
            defaultRate={props.maquininhaCreditoRate} defaultDays={props.maquininhaCreditoDays} />
          <RateRow label="Débito" rateField="maquininhaDebitoRate" daysField="maquininhaDebitoDays"
            defaultRate={props.maquininhaDebitoRate} defaultDays={props.maquininhaDebitoDays} />
        </div>

        {state.error && <p className="text-sm text-red-500">{state.error}</p>}
        {state.success && <p className="text-sm text-green-600">Taxas salvas — vale pra pagamentos confirmados a partir de agora.</p>}

        <SubmitButton />
      </form>
    </div>
  )
}
