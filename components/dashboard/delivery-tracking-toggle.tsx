'use client'

// components/dashboard/delivery-tracking-toggle.tsx
//
// Botão (switch) exibido no topo de "Minhas Entregas" para TENANT_ADMIN e
// MANAGER decidirem se o rastreamento ao vivo do entregador fica ligado.
// Quando desligado, some o mapa/posição tanto para o entregador quanto
// para o cliente final acompanhando o pedido (ver toggleLiveTrackingAction).

import { useState, useTransition } from 'react'
import { Navigation, NavigationOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toggleLiveTrackingAction } from '@/actions/delivery/toggle-live-tracking'

function Toggle({ checked, onClick, disabled }: { checked: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 shrink-0',
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

export function DeliveryTrackingToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleToggle = () => {
    const next = !enabled
    setError(null)
    setEnabled(next) // otimista
    startTransition(async () => {
      const result = await toggleLiveTrackingAction(next)
      if (result.error) {
        setEnabled(!next) // reverte
        setError(result.error)
      }
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5 flex items-center gap-3">
      <div className={cn(
        'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
        enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
      )}>
        {enabled ? <Navigation className="h-4 w-4" /> : <NavigationOff className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Rastreamento ao vivo da entrega</p>
        <p className="text-xs text-muted-foreground">
          {enabled
            ? 'Entregador compartilha a localização e o cliente acompanha no mapa.'
            : 'Desligado — localização não é compartilhada com entregador nem cliente.'}
        </p>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
      <Toggle checked={enabled} onClick={handleToggle} disabled={isPending} />
    </div>
  )
}
